# infra

`docker-compose.dev.yml` runs the development data services only: PostgreSQL 18 with pgvector and Redis. The API and the web
app run natively (`make api`, `make web`) so PyTorch can use Apple's GPU.

```bash
make infra         # start and wait until healthy
make infra-down    # stop (data is kept in the angel_postgres-data volume)
make infra-reset   # stop and DELETE the data
```

Postgres listens on `127.0.0.1:5433`, Redis on `127.0.0.1:6379`. Credentials and the database name come from `.env`
(copied from `.env.example` by `make infra`).
