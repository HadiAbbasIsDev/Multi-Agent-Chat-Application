"#Semester 5 DB Project" 


on local:
sudo docker run -d -p 6333:6333 -v ~/qdrant_data:/qdrant/storage qdrant/qdrant

to check DB run:
psql -h localhost -p 5432 -U chat_user -d chat_app

once its started:

-- List all tables
\dt

-- Describe a table (columns, types)
\d tablename

-- See all records
SELECT * FROM tablename;

-- Exit psql
\q
