#!/bin/bash
# Creates the database used by the test suite alongside the development one.
# Runs once, on first initialisation of the data volume.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE DATABASE hiddenboss_test OWNER $POSTGRES_USER;
EOSQL
