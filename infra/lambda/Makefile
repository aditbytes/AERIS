# SAM "makefile" build. SAM copies this directory to a scratch dir first, so
# scripts/deploy.sh stages ingest/ into ./ingest beforehand (gitignored).
# Lambda runtime already provides boto3.

build-FirmsFunction build-AqiFunction build-WeatherFunction build-SitesFunction:
	mkdir -p "$(ARTIFACTS_DIR)"
	cp -R ingest "$(ARTIFACTS_DIR)/ingest"
	python3 -m pip install -q -r requirements.txt -t "$(ARTIFACTS_DIR)" \
	  --platform manylinux2014_aarch64 --only-binary=:all: --python-version 3.12
