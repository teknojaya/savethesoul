BEGIN;
INSERT INTO "ConsentRecord" SELECT * FROM "ConsentRecord_ci_archive";
DROP TABLE "ConsentRecord_ci_archive";
COMMIT;
SELECT 'restored', count(*) FROM "ConsentRecord" WHERE scope::text IN ('CLINICAL_INTELLIGENCE', 'CARE_PLAN_SUPPORT');
