"""Local numerical tests use simulated physics, never fabricated real observations."""

import copy
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

from models.training.evaluate import compare_predictions, evaluate_model, metrics
from models.training.features import DATA_TYPE, FEATURE_NAMES, FEATURE_RANGES, FEATURE_UNITS, TARGET_NAME, construct_features, validate_features
from models.training.generate import arrays, digest, generate_dataset, physics_signature, point_label, read_dataset, scenario_identity, simulate_case, validate_dataset
from models.training.inference import input_fn, model_fn, output_fn, predict_fn
from models.training.predict import predict_point
from models.training.train import HYPERPARAMETERS, main, software_versions, train_model


@pytest.fixture(scope="module")
def dataset():
    return generate_dataset(seed=19, train=32, validation=8, test=8, points_per_scenario=4)


@pytest.fixture(scope="module")
def artifact(dataset, tmp_path_factory):
    directory = tmp_path_factory.mktemp("artifact")
    train_model(dataset, directory, seed=23)
    return directory


def test_generation_deterministic_and_independent(dataset):
    assert dataset == generate_dataset(seed=19, train=32, validation=8, test=8, points_per_scenario=4)
    other = generate_dataset(seed=20, train=1, validation=1, test=1, points_per_scenario=4)
    assert dataset["splits"]["train"][0]["scenario_id"] != other["splits"]["train"][0]["scenario_id"]
    sets = [{s["scenario_id"] for s in dataset["splits"][split]} for split in ("train", "validation", "test")]
    assert all(not sets[i] & sets[j] for i in range(3) for j in range(i))
    assert len(set.union(*sets)) == 48


def test_every_label_is_an_actual_physics_evaluation(dataset):
    for scenarios in dataset["splits"].values():
        for scenario in scenarios:
            projection, frame = simulate_case(scenario["inputs"])
            for row in scenario["samples"]:
                assert row[TARGET_NAME] == point_label(projection, frame, row["east_m"], row["north_m"])
    assert dataset["training_data_type"] == DATA_TYPE
    assert dataset["physics"] == physics_signature()


def test_leakage_rejected_even_with_different_receptors(dataset):
    bad = copy.deepcopy(dataset)
    source = bad["splits"]["train"][0]
    duplicate = copy.deepcopy(source)
    duplicate["seed"] = [19, 2, 0]
    duplicate["samples"][0]["east_m"] += 1
    duplicate["samples"][0]["features"] = construct_features(
        duplicate["inputs"], duplicate["samples"][0]["east_m"], duplicate["samples"][0]["north_m"])
    duplicate["scenario_id"] = scenario_identity(duplicate)
    bad["splits"]["test"][0] = duplicate
    with pytest.raises(ValueError, match="leakage"):
        validate_dataset(bad)


@pytest.mark.parametrize("key,value", [("training_data_type", "REAL_OBSERVATIONS"),
                                      ("scope", "CHANGING_WEATHER"), ("physics", {}),
                                      ("feature_names", list(reversed(FEATURE_NAMES)))])
def test_dataset_provenance_rejected(dataset, key, value):
    bad = copy.deepcopy(dataset)
    bad[key] = value
    with pytest.raises(ValueError):
        validate_dataset(bad)


@pytest.mark.parametrize("change", ["features", "negative_target", "nan_target", "seed", "fingerprint"])
def test_corrupted_dataset_rejected(dataset, change):
    bad = copy.deepcopy(dataset)
    scenario = bad["splits"]["train"][0]
    row = scenario["samples"][0]
    if change == "features":
        row["features"][6] += 1
    elif change == "negative_target":
        row[TARGET_NAME] = -1
    elif change == "nan_target":
        row[TARGET_NAME] = float("nan")
    elif change == "seed":
        scenario["seed"] = [19, 1, 0]
    else:
        scenario["scenario_id"] = "wrong"
    with pytest.raises(ValueError):
        validate_dataset(bad)


@pytest.mark.parametrize("arguments", [{"train": 0}, {"test": -1}, {"seed": -1},
                                      {"points_per_scenario": True}])
def test_generator_arguments_rejected(arguments):
    with pytest.raises(ValueError):
        generate_dataset(**arguments)


def test_feature_geometry_order_and_calm_convention():
    case = {"u_ms": 3, "v_ms": 4, "forecast_hours": 2, "pblh_m": 800,
            "source_emission_strength": 0.5, "source_radius_m": 2000}
    assert construct_features(case, 30, 40) == [5, 0.6, 0.8, 50, 0, 2, 800, 0.5, 2000]
    case.update(u_ms=0, v_ms=0)
    assert construct_features(case, 30, 40)[:5] == [0, 0, 0, 40, 30]


def request_row(dataset):
    return copy.deepcopy(dataset["splits"]["test"][0]["samples"][0]["features"])


@pytest.mark.parametrize("value", [None, True, "500", float("nan"), float("inf"), -float("inf")])
def test_nonfinite_or_nonnumeric_features_rejected(dataset, value):
    row = request_row(dataset)
    row[6] = value
    with pytest.raises(ValueError):
        input_fn(json.dumps({"feature_names": FEATURE_NAMES, "instances": [row]}), "application/json")


@pytest.mark.parametrize("column,value", [(0, 7), (3, -100001), (4, 100001), (5, 1.5),
                                         (5, 13), (6, 49), (7, 0), (8, 15001), (1, 1)])
def test_invalid_ranges_and_direction_rejected(dataset, column, value):
    row = request_row(dataset)
    row[column] = value
    with pytest.raises(ValueError):
        validate_features([row], FEATURE_NAMES)


@pytest.mark.parametrize("body", [{}, {"instances": []}, {"feature_names": FEATURE_NAMES, "instances": []},
                                  {"feature_names": FEATURE_NAMES, "instances": [[1, 2]]},
                                  {"feature_names": list(reversed(FEATURE_NAMES)), "instances": [[0] * 9]},
                                  {"feature_names": FEATURE_NAMES, "instances": [[0] * 9], "extra": 1}])
def test_missing_count_order_and_extra_fields_rejected(body):
    with pytest.raises(ValueError):
        input_fn(json.dumps(body), "application/json")


def test_metadata_serialization_and_local_inference(dataset, artifact):
    loaded = model_fn(artifact, trusted_artifact=True)
    metadata = loaded.metadata
    assert metadata["feature_names"] == FEATURE_NAMES
    assert metadata["feature_units"] == FEATURE_UNITS
    assert metadata["feature_ranges"] == FEATURE_RANGES
    assert metadata["target_name"] == TARGET_NAME
    assert metadata["dataset_size"] == {"train": 128, "validation": 32, "test": 32}
    assert metadata["seed"] == 23
    assert metadata["software_versions"] == software_versions()
    assert metadata["physics"] == physics_signature()
    assert metadata["hyperparameters"] == {**HYPERPARAMETERS, "random_state": 23}
    assert metadata["training_data_type"] == metadata["SURROGATE_VALIDATION"] == DATA_TYPE
    assert metadata["REAL_OBSERVATIONAL_VALIDATION"] == "NOT_AVAILABLE"
    assert metadata["MODEL_DEFAULT"] == "PHYSICS_BASELINE"
    body = json.dumps({"feature_names": FEATURE_NAMES, "instances": [request_row(dataset)]}).encode()
    data = input_fn(body, "application/json", context={})
    result = predict_fn(data, loaded, context={})
    decoded = json.loads(output_fn(result, "application/json", context={}))
    assert decoded["target_name"] == TARGET_NAME
    assert np.isfinite(decoded["predictions"]).all()
    assert decoded["predictions"][0] >= 0


def test_repeated_training_deterministic(dataset, artifact, tmp_path):
    second = tmp_path / "second"
    train_model(dataset, second, seed=23)
    first_model, second_model = model_fn(artifact, trusted_artifact=True), model_fn(second, trusted_artifact=True)
    x, _ = arrays(dataset, "test")
    assert predict_fn(x, first_model) == predict_fn(x, second_model)
    assert (artifact / "model.pkl").read_bytes() == (second / "model.pkl").read_bytes()
    assert first_model.metadata == second_model.metadata


def test_test_labels_do_not_affect_training(dataset, artifact, tmp_path):
    changed = copy.deepcopy(dataset)
    for scenario in changed["splits"]["test"]:
        for row in scenario["samples"]:
            row[TARGET_NAME] += 1000
    train_model(changed, tmp_path, seed=23)
    x, _ = arrays(dataset, "test")
    assert predict_fn(x, model_fn(artifact, trusted_artifact=True)) == predict_fn(x, model_fn(tmp_path, trusted_artifact=True))
    with pytest.raises(ValueError, match="Stored target"):
        evaluate_model(changed, model_fn(tmp_path, trusted_artifact=True))


def test_protected_test_and_physics_comparison(dataset, artifact):
    report = evaluate_model(dataset, model_fn(artifact, trusted_artifact=True))
    assert report["SURROGATE_VALIDATION"] == DATA_TYPE
    assert report["REAL_OBSERVATIONAL_VALIDATION"] == "NOT_AVAILABLE"
    assert report["MODEL_DEFAULT"] == "PHYSICS_BASELINE"
    for key in ("rmse_ugm3", "mae_ugm3", "bias_ugm3", "worst_absolute_error_ugm3"):
        assert report["physics"][key] == 0
    assert report["surrogate"]["count"] == 32
    assert report["surrogate"]["rmse_ugm3"] > 0
    assert len(report["worst_cases"]) == 5


def test_modified_protected_test_rejected(dataset, artifact):
    changed = copy.deepcopy(dataset)
    changed["splits"]["test"][0]["samples"][0][TARGET_NAME] += 1
    with pytest.raises(ValueError, match="Protected"):
        evaluate_model(changed, model_fn(artifact, trusted_artifact=True))


@pytest.mark.parametrize("split", ["train", "validation"])
def test_edited_fit_labels_rejected_without_replacing_artifact(dataset, artifact, tmp_path, split):
    for name in ("model.pkl", "metadata.json"):
        (tmp_path / name).write_bytes((artifact / name).read_bytes())
    before = {name: (tmp_path / name).read_bytes() for name in ("model.pkl", "metadata.json")}
    changed = copy.deepcopy(dataset)
    changed["splits"][split][0]["samples"][0][TARGET_NAME] += 1
    with pytest.raises(ValueError, match="Stored target"):
        train_model(changed, tmp_path, seed=23)
    assert all((tmp_path / name).read_bytes() == blob for name, blob in before.items())


def test_metrics_known_values_and_zero_relative_denominators():
    result = metrics([0, 2, 4], [1, 1, 6])
    assert result["rmse_ugm3"] == pytest.approx(np.sqrt(2))
    assert result["mae_ugm3"] == pytest.approx(4 / 3)
    assert result["bias_ugm3"] == pytest.approx(2 / 3)
    assert result["relative_error"]["mean"] == 0.5
    assert result["relative_error"]["zero_target_count"] == 1
    assert result["worst_absolute_error_ugm3"] == 2
    assert metrics([0], [0])["relative_error"]["mean"] is None
    comparison = compare_predictions([0, 2, 4], [0, 2, 4], [1, 1, 6])
    assert comparison["physics"]["rmse_ugm3"] == 0
    assert comparison["surrogate"] == result


@pytest.mark.parametrize("target,prediction", [([], []), ([1], [1, 2]), ([float("nan")], [1]),
                                            ([1], [float("inf")]), ([-1], [0])])
def test_invalid_metrics_rejected(target, prediction):
    with pytest.raises(ValueError):
        metrics(target, prediction)


@pytest.mark.parametrize("operation", ["input_type", "output_type", "malformed_json", "direct_nan", "direct_shape"])
def test_sagemaker_contract_errors(dataset, artifact, operation):
    with pytest.raises(ValueError):
        if operation == "input_type":
            input_fn("{}", "text/csv")
        elif operation == "output_type":
            output_fn({}, "text/csv")
        elif operation == "malformed_json":
            input_fn("{broken", "application/json")
        elif operation == "direct_shape":
            predict_fn(np.asarray([1, 2]), model_fn(artifact, trusted_artifact=True))
        else:
            row = request_row(dataset)
            row[6] = float("nan")
            predict_fn(np.asarray([row]), model_fn(artifact, trusted_artifact=True))


@pytest.mark.parametrize("corruption", ["checksum", "order", "provenance", "physics", "software", "seed", "sizes"])
def test_artifact_corruption_rejected(artifact, tmp_path, corruption):
    metadata = json.loads((artifact / "metadata.json").read_text(encoding="utf-8"))
    blob = (artifact / "model.pkl").read_bytes()
    if corruption == "checksum":
        blob += b"altered"
    elif corruption == "order":
        metadata["feature_names"].reverse()
    elif corruption == "provenance":
        metadata["training_data_type"] = "REAL_OBSERVATIONS"
    elif corruption == "physics":
        metadata["physics"]["parameters"]["sigma0_m"] += 1
    elif corruption == "software":
        metadata["software_versions"]["scikit_learn"] = "wrong"
    elif corruption == "seed":
        metadata["seed"] = True
    else:
        metadata["dataset_size"]["train"] = 0
    (tmp_path / "model.pkl").write_bytes(blob)
    (tmp_path / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
    with pytest.raises(ValueError):
        model_fn(tmp_path, trusted_artifact=True)


def test_sagemaker_environment_training_entrypoint(dataset, tmp_path):
    channel = tmp_path / "channel"
    channel.mkdir()
    (channel / "dataset.json").write_text(json.dumps(dataset), encoding="utf-8")
    directory = tmp_path / "model"
    environment = dict(os.environ, SM_CHANNEL_TRAIN=str(channel), SM_MODEL_DIR=str(directory),
                       LOKY_MAX_CPU_COUNT="1")
    script = Path(__file__).resolve().parents[1] / "train.py"
    result = subprocess.run([sys.executable, "-X", "utf8", str(script)], env=environment,
                            capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stderr
    assert model_fn(directory, trusted_artifact=True).metadata["seed"] == 42
    assert read_dataset(channel) == dataset


def test_local_training_entrypoint(dataset, tmp_path):
    path = tmp_path / "dataset.json"
    path.write_text(json.dumps(dataset), encoding="utf-8")
    assert main(["--data", str(path), "--model-dir", str(tmp_path / "model"), "--seed", "7"]) == 0
    assert model_fn(tmp_path / "model", trusted_artifact=True).metadata["seed"] == 7


def test_explicit_model_selection_and_absent_artifact(dataset, artifact, tmp_path):
    scenario = dataset["splits"]["test"][0]
    row = scenario["samples"][0]
    args = (scenario["inputs"], row["east_m"], row["north_m"])
    result = predict_point(*args)
    assert result["model"] == "physics"
    assert result[TARGET_NAME] == row[TARGET_NAME]
    assert predict_point(*args, model="surrogate", model_dir=artifact, trusted_artifact=True)["model"] == "surrogate"
    with pytest.raises(FileNotFoundError):
        predict_point(*args, model="surrogate")
    with pytest.raises(FileNotFoundError):
        predict_point(*args, model="surrogate", model_dir=tmp_path, trusted_artifact=True)
    with pytest.raises(ValueError):
        predict_point(*args, model="automatic")


@pytest.mark.parametrize("unsupported", ["over_12_hours", "multiple_sources", "changing_wind",
                                          "changing_pblh", "other_origin", "polygon_geometry",
                                          "outside_coordinate_range"])
def test_optional_point_surrogate_rejects_unsupported_scope(dataset, artifact, unsupported):
    scenario = dataset["splits"]["test"][0]
    case = copy.deepcopy(scenario["inputs"])
    row = scenario["samples"][0]
    east, north = row["east_m"], row["north_m"]
    if unsupported == "over_12_hours":
        case["forecast_hours"] = 13
    elif unsupported == "multiple_sources":
        case["sources"] = [case.copy(), case.copy()]
    elif unsupported == "changing_wind":
        case["u_ms"] = [case["u_ms"], case["u_ms"] + 1]
    elif unsupported == "changing_pblh":
        case["pblh_m"] = [case["pblh_m"], case["pblh_m"] + 1]
    elif unsupported == "other_origin":
        case["origin"] = {"lat": 31, "lon": 76}
    elif unsupported == "polygon_geometry":
        case["geometry"] = {"type": "Polygon"}
    else:
        east = 1e7
    with pytest.raises(ValueError):
        predict_point(case, east, north, model="surrogate", model_dir=artifact)
