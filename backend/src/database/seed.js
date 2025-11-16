const bcrypt = require('bcrypt');
const { pool } = require('../config/database');

async function seedDatabase() {
  let client;
  
  try {
    console.log('Starting database seeding...');
    
    client = await pool.connect();
    await client.query('BEGIN');

    // Create sample users
    console.log('Creating sample users...');
    const password = await bcrypt.hash('Test123!', 10);
    
    const users = [
      { email: 'izaan@nu.edu.pk', displayName: 'Izaan S', password },
      { email: 'hadi@nu.edu.pk', displayName: 'Hadi A', password },
      { email: 'mishaal@nu.edu.pk', displayName: 'MIshaal F', password },
      { email: 'shaheer@nu.edu.pk', displayName: 'M Shaheer', password },
      { email: 'eve@nu.edu.pk', displayName: 'Eve M', password }
    ];

    const userIds = [];
    
    for (const user of users) {
      const result = await client.query(
        `INSERT INTO users (email, password_hash, display_name)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [user.email, user.password, user.displayName]
      );
      userIds.push(result.rows[0].id);
      console.log(`Created user: ${user.email}`);
    }

    // Create contact requests (all accepted)
    console.log('\nCreating contact connections...');
    await client.query(
      `INSERT INTO contact_requests (from_user_id, to_user_id, status, responded_at)
       VALUES 
       ($1, $2, 'ACCEPTED', CURRENT_TIMESTAMP),
       ($1, $3, 'ACCEPTED', CURRENT_TIMESTAMP),
       ($2, $3, 'ACCEPTED', CURRENT_TIMESTAMP),
       ($2, $4, 'ACCEPTED', CURRENT_TIMESTAMP),
       ($3, $5, 'ACCEPTED', CURRENT_TIMESTAMP)`,
      userIds
    );
    console.log('Contact connections created');

    // Create direct threads
    console.log('\nCreating direct threads...');
    
    // Thread 1: Alice & Bob
    const thread1 = await client.query(
      `INSERT INTO chat_threads (type) VALUES ('DIRECT') RETURNING id`
    );
    await client.query(
      `INSERT INTO direct_threads (thread_id, user_a_id, user_b_id)
       VALUES ($1, $2, $3)`,
      [thread1.rows[0].id, userIds[0] < userIds[1] ? userIds[0] : userIds[1], 
       userIds[0] < userIds[1] ? userIds[1] : userIds[0]]
    );

    // Add sample messages
    await client.query(
      `INSERT INTO messages (thread_id, sender_id, body, status)
       VALUES 
       ($1, $2, 'Hey Bob! How are you doing?', 'READ'),
       ($1, $3, 'Hi Alice! I''m doing great, thanks for asking!', 'READ')`,
      [thread1.rows[0].id, userIds[0], userIds[1]]
    );

    console.log('Direct thread created between Alice and Bob');

    // Create a group
    console.log('\nCreating sample group...');
    const groupThread = await client.query(
      `INSERT INTO chat_threads (type) VALUES ('GROUP') RETURNING id`
    );
    
    await client.query(
      `INSERT INTO groups (thread_id, name, owner_id, member_count, picture_url)
       VALUES ($1, 'Study Group', $2, 4, NULL)`,
      [groupThread.rows[0].id, userIds[0]]
    );

    // Add group members
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES
       ($1, $2, 'ADMIN'),
       ($1, $3, 'MEMBER'),
       ($1, $4, 'ADMIN'),
       ($1, $5, 'MEMBER')`,
      [groupThread.rows[0].id, userIds[0], userIds[1], userIds[2], userIds[3]]
    );

    // Add group messages
    await client.query(
      `INSERT INTO messages (thread_id, sender_id, body, status) VALUES
       ($1, $2, 'Welcome everyone to our study group!', 'SENT'),
       ($1, $3, 'Thanks for creating this Alice!', 'SENT'),
       ($1, $4, 'Looking forward to studying together', 'SENT')`,
      [groupThread.rows[0].id, userIds[0], userIds[1], userIds[2]]
    );

    console.log('Study group created with 4 members');

    // Create sample AI queries
    console.log('\nCreating sample AI queries...');
    const aiQuery1 = await client.query(
      `INSERT INTO ai_queries (user_id, prompt)
       VALUES ($1, 'What did we discuss about the database project?')
       RETURNING id`,
      [userIds[0]]
    );

    await client.query(
      `INSERT INTO ai_results (query_id, answer_text, citations)
       VALUES ($1, $2, $3)`,
      [
        aiQuery1.rows[0].id,
        'Based on your messages, the team discussed using PostgreSQL for the database and implementing REST APIs for the backend.',
        JSON.stringify([
          { messageId: 'sample-msg-id-1', threadId: thread1.rows[0].id, score: 0.95 },
          { messageId: 'sample-msg-id-2', threadId: groupThread.rows[0].id, score: 0.87 }
        ])
      ]
    );

    console.log('Sample AI query created');

    await client.query('COMMIT');
    
    console.log('\n=================================');
    console.log('Database seeded successfully!');
    console.log('=================================');
    console.log('\nSample users created:');
    users.forEach(user => {
      console.log(`- ${user.email} / password: Test123!`);
    });
    console.log('\nYou can now start the server and login with any of these accounts.');
    
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

seedDatabase();