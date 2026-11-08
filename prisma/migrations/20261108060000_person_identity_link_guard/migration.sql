-- Identity links are one-to-one through the existing unique userId constraint.
-- External contacts must never be linked to authentication accounts.
ALTER TABLE "Person"
  ADD CONSTRAINT "Person_linked_user_kind_check"
  CHECK ("userId" IS NULL OR "kind" = 'EMPLOYEE');
