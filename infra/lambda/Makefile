# SAM "makefile" build. SAM copies this directory to a scratch dir first, so
# scripts/deploy.sh stages the Python packages (ingest, models, agent, pipeline,
# api) next to this file beforehand (gitignored).
# Lambda runtime already provides boto3.

PIP = python3 -m pip install -q -t "$(ARTIFACTS_DIR)" \
	--platform manylinux2014_aarch64 --only-binary=:all: --python-version 3.12

build-FirmsFunction build-AqiFunction build-WeatherFunction build-SitesFunction:
	mkdir -p "$(ARTIFACTS_DIR)"
	cp -R ingest "$(ARTIFACTS_DIR)/ingest"
	$(PIP) -r requirements.txt

build-PublishFunction build-DetectFunction build-CorridorFunction build-RankFunction:
	mkdir -p "$(ARTIFACTS_DIR)"
	cp -R ingest models pipeline "$(ARTIFACTS_DIR)/"
	$(PIP) -r requirements-pipeline.txt

build-AgentFunction:
	mkdir -p "$(ARTIFACTS_DIR)"
	cp -R ingest agent pipeline "$(ARTIFACTS_DIR)/"
	$(PIP) -r requirements-agent.txt

build-ApiFunction:
	mkdir -p "$(ARTIFACTS_DIR)"
	cp -R ingest api "$(ARTIFACTS_DIR)/"
