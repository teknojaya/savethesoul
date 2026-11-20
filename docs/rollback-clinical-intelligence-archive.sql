BEGIN;
CREATE TABLE "ConsentRecord_ci_archive" AS SELECT * FROM "ConsentRecord" WHERE scope::text IN ('CLINICAL_INTELLIGENCE', 'CARE_PLAN_SUPPORT');
DELETE FROM "ConsentRecord" WHERE scope::text IN ('CLINICAL_INTELLIGENCE', 'CARE_PLAN_SUPPORT');
COMMIT;
SELECT 'archived', count(*) FROM "ConsentRecord_ci_archive";
