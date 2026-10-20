# infra

`docker-compose.dev.yml` нь хөгжүүлэлтэд хэрэгтэй өгөгдлийн үйлчилгээг л асаана: pgvector-тэй PostgreSQL 18 болон Redis.
API болон web-ийг Docker-оор биш шууд (`make api`, `make web`) ажиллуулдаг. Ингэснээр PyTorch Apple-ийн GPU-г ашиглаж чадна.

```bash
make infra         # асааж, бэлэн болтол хүлээнэ
make infra-down    # зогсооно (өгөгдөл angel_postgres-data volume-д хадгалагдана)
make infra-reset   # зогсоож, өгөгдлийг УСТГАНА
```

Postgres `127.0.0.1:5433`, Redis `127.0.0.1:6379` порт дээр сонсоно. Нэвтрэх мэдээлэл, өгөгдлийн сангийн нэр `.env`-ээс
ирнэ (`make infra` анх удаа `.env.example`-ээс хуулж үүсгэнэ).
