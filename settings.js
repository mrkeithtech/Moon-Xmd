/*==================================

      🌙 MOON XMD 🌙
  DEVELOPED BY KEITH TECH
    
================================*/

const fs = require('fs')
if (fs.existsSync('.env')) require('dotenv').config({ path: __dirname+'/.env' })





const settings = {

//======= BOT SETTINGS ============//

  SESSION_ID: process.env.SESSION_ID || '',

 
  timezone: process.env.timezone || "Africa/Harare",
  
  botOwner: process.env.botOwner || 'Keith',
  
  ownerNumber: process.env.ownerNumber || '263789745277',
  
  // Multi-prefix support
  Prefix: process.env.Prefix || ['','!','.','#','&']
  
};

module.exports = settings;