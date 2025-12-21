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

    // Find the correct extracted directory
    console.log(chalk.blue("[🔍] Locating extracted files..."));
    
    const tempContents = fs.readdirSync(TEMP_DIR);
    const extractedFolder = tempContents.find(item => {
      const itemPath = path.join(TEMP_DIR, item);
      return fs.statSync(itemPath).isDirectory();
    });
    
    if (!extractedFolder) {
      throw new Error('No extracted directory found in temp folder');
    }

    // Update EXTRACT_DIR to the actual extracted folder
    EXTRACT_DIR = path.join(TEMP_DIR, extractedFolder);
    EXTRACTED_SETTINGS = path.join(EXTRACT_DIR, "settings.js");
    
    console.log(chalk.green(`[✅] Found extracted directory: ${extractedFolder}`));

    // Verify essential files exist
    const indexPath = path.join(EXTRACT_DIR, "index.js");
    const settingsPath = path.join(EXTRACT_DIR, "settings.js");
    const packagePath = path.join(EXTRACT_DIR, "package.json");
    
    console.log(chalk.cyan("\n[📋] Verifying essential files..."));
    console.log(chalk.cyan(`[📄] index.js: ${fs.existsSync(indexPath) ? '✅' : '❌'}`));
    console.log(chalk.cyan(`[📄] settings.js: ${fs.existsSync(settingsPath) ? '✅' : '❌'}`));
    console.log(chalk.cyan(`[📄] package.json: ${fs.existsSync(packagePath) ? '✅' : '❌'}`));

    // Verify index.js exists (critical file)
    if (!fs.existsSync(indexPath)) {
      throw new Error('index.js not found in extracted directory - cannot proceed');
    }

    // Check for additional important folders
    const foldersToCheck = ['commands', 'lib', 'data', 'session'];
    console.log(chalk.cyan("\n[📁] Checking directory structure..."));
    
    foldersToCheck.forEach(folder => {
      const folderPath = path.join(EXTRACT_DIR, folder);
      if (fs.existsSync(folderPath)) {
        const fileCount = fs.readdirSync(folderPath).length;
        console.log(chalk.green(`[✅] ${folder}/ found (${fileCount} items)`));
      } else {
        console.log(chalk.yellow(`[⚠️] ${folder}/ not found`));
      }
    });

    // List all files in root directory
    console.log(chalk.cyan("\n[📋] Root directory contents:"));
    const rootFiles = fs.readdirSync(EXTRACT_DIR);
    rootFiles.forEach(file => {
      const filePath = path.join(EXTRACT_DIR, file);
      const isDir = fs.statSync(filePath).isDirectory();
      console.log(chalk.gray(`   ${isDir ? '📁' : '📄'} ${file}`));
    });

    console.log(chalk.green("\n[✅] All verifications completed"));
    console.log(chalk.blue(`[📍] Working directory: ${EXTRACT_DIR}`));

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
  console.log(chalk.blue("\n[📦] Installing dependencies in extracted directory..."));
  console.log(chalk.cyan(`[📍] Installing in: ${EXTRACT_DIR}`));
  
  // Check if package.json exists
  const packagePath = path.join(EXTRACT_DIR, "package.json");
  if (!fs.existsSync(packagePath)) {
    console.log(chalk.yellow("[⚠️] No package.json found, skipping dependency installation"));
    return;
  }

  // Read and display some package info
  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    console.log(chalk.cyan(`[📦] Package: ${packageJson.name || 'Unknown'}`));
    console.log(chalk.cyan(`[🔢] Version: ${packageJson.version || 'Unknown'}`));
  } catch (e) {
    console.log(chalk.yellow("[⚠️] Could not read package.json details"));
  }
  
  return new Promise((resolve, reject) => {
    const npm = spawn('npm', ['install', '--legacy-peer-deps'], {
      cwd: EXTRACT_DIR,
      stdio: 'inherit',
      shell: true
    });

    npm.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green("\n[✅] Dependencies installed successfully"));
        
        // Verify node_modules was created
        const nodeModulesPath = path.join(EXTRACT_DIR, 'node_modules');
        if (fs.existsSync(nodeModulesPath)) {
          const moduleCount = fs.readdirSync(nodeModulesPath).length;
          console.log(chalk.green(`[✅] node_modules created with ${moduleCount} packages`));
        }
        
        resolve();
      } else {
        console.log(chalk.yellow("[⚠️] Some dependencies may have issues, but continuing..."));
        resolve(); // Continue anyway
      }
    });

    npm.on('error', (err) => {
      console.error(chalk.red("[❌] Failed to install dependencies:"), err.message);
      console.log(chalk.yellow("[⚠️] Continuing without full dependencies..."));
      resolve(); // Continue anyway
    });
  });
}

// === START BOT ===
function startBot() {
  console.log(chalk.cyan("\n╔════════════════════════════════════════╗"));
  console.log(chalk.cyan("║     🚀 LAUNCHING MOON-XMD BOT         ║"));
  console.log(chalk.cyan("╚════════════════════════════════════════╝\n"));
  
  // Final verification before starting
  if (!fs.existsSync(EXTRACT_DIR)) {
    console.error(chalk.red("[❌] Extracted directory not found. Cannot start bot."));
    console.error(chalk.red(`[📍] Expected path: ${EXTRACT_DIR}`));
    return;
  }

  const indexPath = path.join(EXTRACT_DIR, "index.js");
  if (!fs.existsSync(indexPath)) {
    console.error(chalk.red("[❌] index.js not found in extracted directory."));
    console.error(chalk.red(`[📍] Expected path: ${indexPath}`));
    
    // List what's actually in the directory
    console.log(chalk.yellow("\n[📋] Available files in directory:"));
    const files = fs.readdirSync(EXTRACT_DIR);
    files.forEach(file => {
      console.log(chalk.gray(`   - ${file}`));
    });
    return;
  }

  console.log(chalk.green(`[✅] Found index.js at: ${indexPath}`));
  console.log(chalk.green(`[✅] Working directory: ${EXTRACT_DIR}`));
  console.log(chalk.blue("\n[🔄] Starting bot process...\n"));
  console.log(chalk.gray("═".repeat(60)));

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
    console.log(chalk.gray("\n" + "═".repeat(60)));
    console.log(chalk.red(`\n[💥] Bot process terminated with exit code: ${code}`));
    
    if (code !== 0) {
      console.log(chalk.yellow("[⚠️] Bot crashed or was stopped"));
      console.log(chalk.yellow("[🔄] Restarting bot in 5 seconds..."));
      setTimeout(() => startBot(), 5000);
    } else {
      console.log(chalk.green("[✅] Bot stopped gracefully"));
    }
  });

  bot.on("error", (err) => {
    console.error(chalk.red("\n[❌] Bot failed to start:"), err.message);
    console.error(chalk.red("[💡] Check if Node.js is properly installed"));
    console.error(chalk.red(`[📍] Attempted to run: ${indexPath}`));
  });

  // Handle process termination
  process.on('SIGINT', () => {
    console.log(chalk.yellow("\n[⏹️] Received SIGINT - Shutting down bot gracefully..."));
    bot.kill('SIGINT');
    setTimeout(() => process.exit(0), 1000);
  });

  process.on('SIGTERM', () => {
    console.log(chalk.yellow("\n[⏹️] Received SIGTERM - Shutting down bot gracefully..."));
    bot.kill('SIGTERM');
    setTimeout(() => process.exit(0), 1000);
  });

  console.log(chalk.green("[✅] Bot process started successfully"));
  console.log(chalk.cyan("[💡] Press Ctrl+C to stop the bot"));
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