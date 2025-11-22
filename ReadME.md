"#Semester 5 DB Project" 




to check DB run:
psql -h localhost -p 5432 -U postgres -d eagri_backend on local machine


once its started:

-- List all tables
\dt

-- Describe a table (columns, types)
\d tablename

-- See all records
SELECT * FROM tablename;

-- Exit psql
\q
