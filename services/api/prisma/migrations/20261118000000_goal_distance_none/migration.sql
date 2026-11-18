-- 목표 없음(F03-R09). 새 enum 값은 같은 트랜잭션에서 쓸 수 없어 체크 제약은 다음 마이그레이션에 둔다
ALTER TYPE "goal_distance" ADD VALUE 'none';
