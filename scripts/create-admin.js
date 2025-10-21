/**
 * Script to create an initial admin user
 * 
 * Usage:
 *   node scripts/create-admin.js <email> <password>
 * 
 * Example:
 *   node scripts/create-admin.js alister@alistercameron.com changeme123
 * 
 * This will output a SQL statement that you can run against your D1 database.
 */

import bcrypt from 'bcryptjs';

async function createAdmin() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: node scripts/create-admin.js <email> <password>');
    console.error('Example: node scripts/create-admin.js admin@example.com mypassword');
    process.exit(1);
  }
  
  const [email, password] = args;
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.error('Error: Invalid email format');
    process.exit(1);
  }
  
  // Validate password length
  if (password.length < 8) {
    console.error('Error: Password must be at least 8 characters long');
    process.exit(1);
  }
  
  try {
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    console.log('\n=== Admin User Setup ===\n');
    console.log('Email:', email);
    console.log('Password:', '********');
    console.log('\n=== SQL Statement ===\n');
    console.log('Run this SQL statement in your D1 database:\n');
    console.log(`INSERT INTO admin_users (email, password_hash) VALUES ('${email.toLowerCase()}', '${passwordHash}');`);
    console.log('\n=== Alternative: Update existing user ===\n');
    console.log('If the user already exists, use this SQL statement instead:\n');
    console.log(`UPDATE admin_users SET password_hash = '${passwordHash}' WHERE email = '${email.toLowerCase()}';`);
    console.log('\n=== Wrangler D1 Command ===\n');
    console.log('To execute via wrangler:\n');
    console.log(`wrangler d1 execute DB --command="INSERT INTO admin_users (email, password_hash) VALUES ('${email.toLowerCase()}', '${passwordHash}');"`);
    console.log('\nReplace DB with your actual database name from wrangler.json\n');
  } catch (error) {
    console.error('Error generating password hash:', error);
    process.exit(1);
  }
}

createAdmin();
