We-Band-BackEnd-main/
│
├── .idea/                       # IDE 설정
├── logs/                        # 로그 파일
├── prisma/                      # Prisma 스키마 (DB 모델 정의)
├── src/                         # 백엔드 소스
│   ├── controllers/             # 컨트롤러(요청/응답 처리)
│   ├── middlewares/             # 미들웨어
│   ├── routes/                  # 라우터(URL <-> Controller 연결)
│   ├── services/                # 서비스(비즈니스 로직)
│   ├── types/                   # 타입 정의
│   ├── utils/                   # 유틸리티 함수
│   ├── index.ts                 # 서버 엔트리(Express 설정 + listen 4000)
│   └── prisma.ts                # PrismaClient 생성(export const prisma)
│── .env                         # 환경 변수 파일
├── .editorconfig                # 에디터 공통 코드 스타일 규칙
├── .gitattributes               # Git 파일 처리 규칙
├── .gitignore                   # Git에서 제외할 파일
├── .yarnrc.yml                  # Yarn Berry 동작 설정
├── package.json                 # 프로젝트 정보, 의존성, 실행 스크립트
├── package-lock.json            # npm 의존성 버전 고정 파일
├── prettier.config.js           # Prettier 코드 포맷 규칙
├── prisma.config.ts             # Prisma adapter 설정(mysql, DATABASE_URL)
├── tsconfig.json                # ts 설정 파일
└── yarn.lock                    # Yarn 의존성 버전 고정 파일
