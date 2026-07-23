PYTHON ?= python3

.PHONY: install demo test check authority agent executor frontend neo4j

install:
	$(PYTHON) -m pip install -e ".[dev]"

demo:
	PYTHONPATH=backend $(PYTHON) -m dragback.demo

test:
	PYTHONPATH=backend $(PYTHON) -m pytest

check:
	PYTHONPATH=backend $(PYTHON) -m pytest
	$(PYTHON) -m compileall -q backend

authority:
	PYTHONPATH=backend $(PYTHON) -m uvicorn dragback.services.authority_api:app --port 8001 --reload

agent:
	PYTHONPATH=backend $(PYTHON) -m uvicorn dragback.services.agent_api:app --port 8002 --reload

executor:
	PYTHONPATH=backend $(PYTHON) -m uvicorn dragback.services.executor_api:app --port 8003 --reload

frontend:
	cd frontend && npm run dev

neo4j:
	docker compose up neo4j
