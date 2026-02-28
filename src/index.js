require('dotenv').config();

const fs = require('fs');
const path = require('path');
const TikTokClient = require('./tiktokClient');
const logger = require('./logger');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function loadConfig() {
  const configPath = process.env.CONFIG_FILE || './config.json';
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

function buildCaption(filename, config) {
  const basename = path.basename(filename, path.extname(filename));
  const template = config.default_caption_template || '{{filename}}';
  const hashtags = (config.default_hashtags || []).join(' ');
  return `${template.replace('{{filename}}', basename)} ${hashtags}`.trim();
}

function listInputVideos(inboxDir) {
  return fs
    .readdirSync(inboxDir)
    .filter((name) => name.toLowerCase().endsWith('.mp4'))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function moveFileSafe(srcPath, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, path.basename(srcPath));
  fs.renameSync(srcPath, targetPath);
  return targetPath;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processFile(client, filepath, caption) {
  const fileBuffer = fs.readFileSync(filepath);
  const init = await client.initVideoUpload({
    title: caption,
    privacyLevel: 'SELF_ONLY',
    fileSize: fileBuffer.length
  });

  await client.uploadVideoToUrl(init.upload_url, fileBuffer);
  logger.info('Upload completed', { publishId: init.publish_id });

  let latestStatus = null;
  for (let i = 0; i < 10; i += 1) {
    await sleep(5000);
    latestStatus = await client.fetchPublishStatus(init.publish_id);
    logger.info('Fetched publish status', { publishId: init.publish_id, status: latestStatus });

    const statusText = JSON.stringify(latestStatus).toLowerCase();
    if (statusText.includes('success') || statusText.includes('published')) {
      return { ok: true, publishId: init.publish_id, status: latestStatus };
    }

    if (statusText.includes('fail') || statusText.includes('error')) {
      return { ok: false, publishId: init.publish_id, status: latestStatus };
    }
  }

  return { ok: true, publishId: init.publish_id, status: latestStatus, note: 'status polling timeout' };
}

async function main() {
  const cwd = process.cwd();
  const inboxDir = path.join(cwd, 'inbox');
  const doneDir = path.join(cwd, 'done');
  const failedDir = path.join(cwd, 'failed');

  const config = loadConfig();
  const maxPerRun = Number(config.max_per_run || 1);

  const client = new TikTokClient({
    clientKey: requiredEnv('TIKTOK_CLIENT_KEY'),
    clientSecret: requiredEnv('TIKTOK_CLIENT_SECRET'),
    redirectUri: requiredEnv('TIKTOK_REDIRECT_URI'),
    scopes: process.env.TIKTOK_SCOPES || 'user.info.basic,video.upload',
    apiBase: process.env.TIKTOK_API_BASE || 'https://open.tiktokapis.com',
    tokensFile: process.env.TOKENS_FILE || './tokens.json'
  });

  const candidates = listInputVideos(inboxDir).slice(0, maxPerRun);
  logger.info('Start batch run', { maxPerRun, targetCount: candidates.length });

  for (const fileName of candidates) {
    const sourcePath = path.join(inboxDir, fileName);
    const caption = buildCaption(fileName, config);

    try {
      logger.info('Processing file', { fileName, caption });
      const result = await processFile(client, sourcePath, caption);
      if (!result.ok) {
        throw new Error(`TikTok status returned failed result: ${JSON.stringify(result.status)}`);
      }

      const movedPath = moveFileSafe(sourcePath, doneDir);
      logger.info('File moved to done', { from: sourcePath, to: movedPath, publishId: result.publishId });
    } catch (err) {
      const movedPath = moveFileSafe(sourcePath, failedDir);
      logger.error('File processing failed', {
        fileName,
        error: err.message,
        movedTo: movedPath
      });
    }
  }

  logger.info('Batch run finished');
}

main().catch((err) => {
  logger.error('Fatal error in batch run', { error: err.message });
  process.exit(1);
});
