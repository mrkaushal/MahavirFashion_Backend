// generateHash.js
const bcrypt = require('bcryptjs');

const passwordToHash = '123456'; // <--- Type your desired password here
const saltRounds = 10;

bcrypt.hash(passwordToHash, saltRounds, (err, hash) => {
  if (err) console.error(err);
  console.log('\n--- COPY THE STRING BELOW ---');
  console.log(hash);
  console.log('-----------------------------\n');
});