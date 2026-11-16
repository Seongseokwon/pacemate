# T-108 API 컨테이너 로컬 실행

저장소 루트에서 실행한다. Docker Desktop과 로컬 PostgreSQL이 필요하다.

```sh
docker compose up -d db
docker build -t pacemate-api:local .
```

`services/api/.env`에 로컬 API 환경 변수를 설정한다. 컨테이너 안에서 `localhost`는 컨테이너 자신이므로 Docker Desktop에서는 DB 주소만 다음과 같이 덮어쓴다. 아래 주소는 로컬 개발 DB 전용이다.

```sh
docker run --rm --env-file services/api/.env \
  -e DATABASE_URL=postgresql://pacemate:pacemate@host.docker.internal:5433/pacemate \
  pacemate-api:local node services/api/node_modules/prisma/build/index.js migrate deploy --config services/api/prisma.config.ts
```

마이그레이션 적용 후 기존 로컬 서버의 3000 포트와 겹치지 않도록 호스트의 3001 포트에서 실행한다.

```sh
docker run --rm --name pacemate-api-local -p 127.0.0.1:3001:3000 \
  --env-file services/api/.env \
  -e DATABASE_URL=postgresql://pacemate:pacemate@host.docker.internal:5433/pacemate \
  pacemate-api:local
```

다른 터미널에서 `curl http://localhost:3001/health`로 확인하고 실행 중인 터미널에서 Ctrl+C로 중지한다. 환경 변수 파일에 인증 설정이 필요하다. 앱에서 이 컨테이너를 사용하려면 별도로 API 주소와 Android 포트 전달을 3001로 설정해야 한다.

운영 DB 마이그레이션과 Cloud Run 배포는 별도 작업이다. 컨테이너 시작 시 마이그레이션을 자동으로 실행하지 않는다.
