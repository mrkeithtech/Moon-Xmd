/*

M O O N   X M D   S E T T I N G S


*/

const settings = {


  SESSION_ID: process.env.SESSION_ID || 'Paste Ur SESSION_ID Here', // Make sure it starts with Moon;;;

  botName: process.env.botName || "𝐌𝐎𝐎𝐍 𝐗𝐌𝐃 🌙",
 
  timezone: process.env.timezone || "Africa/Harare",
  
  
  ownerNumber: process.env.ownerNumber || '263776509966',
 
   // Examples: '.' or ['.', '!', '#', '$']
  Prefix: process.env.Prefix ? (process.env.Prefix.includes(',') ? process.env.Prefix.split(',') : process.env.Prefix) : ['.', '!', '#', '$'],

};

module.exports = settings;