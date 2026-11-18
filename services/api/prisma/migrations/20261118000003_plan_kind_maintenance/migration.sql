-- 유지 계획(F03-R10, TE-G10). 새 enum 값은 같은 트랜잭션에서 쓸 수 없어 체크 제약은 다음 마이그레이션에 둔다
ALTER TYPE "plan_kind" ADD VALUE 'maintenance';
