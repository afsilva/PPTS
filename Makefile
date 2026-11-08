SHELL := /bin/sh
.DEFAULT_GOAL := help

PODMAN ?= podman
RUNTIME_DIR ?=
ENV_FILE ?=
COMPOSE_FILE ?= compose.yaml
PPTS_PORT ?= 3000

export PODMAN
export RUNTIME_DIR
export ENV_FILE
export COMPOSE_FILE
export PPTS_PORT

.PHONY: help start restart stop clean status logs config credentials

help: ## Show available commands
	@printf '%s\n' \
	  'PPTS local Podman lifecycle' \
	  '' \
	  '  make start     Start Podman if needed, build, migrate, seed, and run PPTS' \
	  '  make restart   Stop and start the stack' \
	  '  make stop      Stop containers while preserving database data' \
	  '  make clean     Remove containers, images, and both local database volumes' \
	  '  make status    Show stack status' \
	  '  make logs      Follow application logs' \
	  '  make config    Render and validate the Compose configuration' \
	  '  make credentials  Show generated local-only login credentials' \
	  '' \
	  'Secrets default outside this repository:' \
	  '  macOS: ~/Library/Application Support/PPTS/environment' \
	  '  Linux: $${XDG_STATE_HOME:-~/.local/state}/ppts/environment' \
	  '' \
	  'Overrides: RUNTIME_DIR=/external/path PPTS_PORT=3000 PODMAN=podman'

start: ## Start the local stack
	@./scripts/containers.sh start

restart: ## Restart the local stack
	@./scripts/containers.sh restart

stop: ## Stop the stack and preserve data
	@./scripts/containers.sh stop

clean: ## Remove the stack, images, and database volume
	@./scripts/containers.sh clean

status: ## Show container status
	@./scripts/containers.sh status

logs: ## Follow application logs
	@./scripts/containers.sh logs

config: ## Validate Compose configuration
	@./scripts/containers.sh config

credentials: ## Show generated local-only credentials
	@./scripts/show-credentials.sh
