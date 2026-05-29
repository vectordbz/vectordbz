#!/usr/bin/env node

/**
 * Generates latest.yml, latest-mac.yml, and latest-linux.yml files
 * for electron-updater from GitHub release artifacts.
 *
 * FIX: Ensures the Windows YAML file uses the confirmed dynamic naming convention:
 * [AppName]-[Version].Setup.exe
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- Configuration and Setup ---

// Get version and app name from package.json
const packageJsonPath = path.join(__dirname, '../app/package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const appName = packageJson.name; // e.g., 'VectorDBZ'
const version = packageJson.version.replace(/^v/, ''); // e.g., '0.0.9' or '0.1.0'
const releaseDate = new Date().toISOString();

// Define the artifacts directory
const artifactsDir = path.join(__dirname, '../artifacts');

if (!fs.existsSync(artifactsDir)) {
    console.error('Artifacts directory not found. This script should only run in GitHub Actions workflow.');
    process.exit(1);
}

// --- Utility Functions ---

function calculateSHA512(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha512').update(fileBuffer).digest('hex');
}

function findFile(dir, pattern) {
    if (!fs.existsSync(dir)) return null;

    function searchRecursive(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                const found = searchRecursive(fullPath);
                if (found) return found;
            } else if (entry.isFile() && pattern.test(entry.name)) {
                return fullPath;
            }
        }
        return null;
    }

    return searchRecursive(dir);
}

function generateYAML(platform, files) {
    // Uses the primary file (files[0]) for the 'path' and root 'sha512' fields
    const yaml = {
        version: version,
        files: files.map(file => ({
            url: file.name,
            sha512: file.sha512,
            size: file.size,
        })),
        path: files[0].name, // Primary file (the installer)
        sha512: files[0].sha512,
        releaseDate: releaseDate,
    };

    return yaml;
}

// --- YAML Generation: Windows (Target Fix) ---

const winDir = path.join(artifactsDir, 'win32-x64');
const actualWinExePath = findFile(winDir, /\.exe$/i); // Find the actual generated EXE file

if (actualWinExePath) {
    const stats = fs.statSync(actualWinExePath);
    const sha512 = calculateSHA512(actualWinExePath);

    // CRUCIAL FIX: Construct the exact, dynamic filename based on your GitHub release structure.
    const expectedFileName = `${appName}-${version}.Setup.exe`;
    
    console.log(`Windows YAML pointing to: '${expectedFileName}'`);
    
    // NOTE: This assumes that the file uploaded to GitHub releases is named
    // exactly: VectorDBZ-X.X.X.Setup.exe

    const yaml = generateYAML('win32', [{
        name: expectedFileName, // Use the *expected* name for the YAML 'url' and 'path' fields
        sha512: sha512,
        size: stats.size,
    }]);

    const yamlContent = `version: ${yaml.version}
files:
  - url: ${yaml.files[0].url}
    sha512: ${yaml.files[0].sha512}
    size: ${yaml.files[0].size}
path: ${yaml.path}
sha512: ${yaml.sha512}
releaseDate: '${yaml.releaseDate}'
`;

    fs.writeFileSync(path.join(artifactsDir, 'latest.yml'), yamlContent);
    console.log('Generated latest.yml for Windows successfully.');
} else {
    console.error('Windows installer (.exe) not found in artifacts directory. Skipping latest.yml generation.');
}


// --- YAML Generation: macOS ---

const macDirs = [
    path.join(artifactsDir, 'darwin-x64'),
    path.join(artifactsDir, 'darwin-arm64'),
];

const macFiles = [];
macDirs.forEach(dir => {
    const zipFile = findFile(dir, /\.zip$/i);
    if (zipFile) {
        const stats = fs.statSync(zipFile);
        const sha512 = calculateSHA512(zipFile);
        const fileName = path.basename(zipFile);
        macFiles.push({
            name: fileName,
            sha512: sha512,
            size: stats.size,
        });
    }
});

if (macFiles.length > 0) {
    const yaml = generateYAML('darwin', macFiles);

    let yamlContent = `version: ${yaml.version}
files:
`;
    yaml.files.forEach(file => {
        yamlContent += `  - url: ${file.url}
    sha512: ${file.sha512}
    size: ${file.size}
`;
    });
    yamlContent += `path: ${yaml.path}
sha512: ${yaml.sha512}
releaseDate: '${yaml.releaseDate}'
`;

    fs.writeFileSync(path.join(artifactsDir, 'latest-mac.yml'), yamlContent);
    console.log('Generated latest-mac.yml for macOS successfully.');
}

// --- YAML Generation: Linux ---

const linuxDir = path.join(artifactsDir, 'linux-x64');
const linuxDeb = findFile(linuxDir, /\.deb$/i);
const linuxRpm = findFile(linuxDir, /\.rpm$/i);

const linuxFiles = [];
if (linuxDeb) {
    const stats = fs.statSync(linuxDeb);
    const sha512 = calculateSHA512(linuxDeb);
    linuxFiles.push({
        name: path.basename(linuxDeb),
        sha512: sha512,
        size: stats.size,
    });
}
if (linuxRpm) {
    const stats = fs.statSync(linuxRpm);
    const sha512 = calculateSHA512(linuxRpm);
    linuxFiles.push({
        name: path.basename(linuxRpm),
        sha512: sha512,
        size: stats.size,
    });
}

if (linuxFiles.length > 0) {
    const yaml = generateYAML('linux', linuxFiles);

    let yamlContent = `version: ${yaml.version}
files:
`;
    yaml.files.forEach(file => {
        yamlContent += `  - url: ${file.url}
    sha512: ${file.sha512}
    size: ${file.size}
`;
    });
    yamlContent += `path: ${yaml.path}
sha512: ${yaml.sha512}
releaseDate: '${yaml.releaseDate}'
`;

    fs.writeFileSync(path.join(artifactsDir, 'latest-linux.yml'), yamlContent);
    console.log('Generated latest-linux.yml for Linux successfully.');
}

console.log('All update YAML files generated successfully!');