import path from 'path';
import { fileURLToPath } from 'url';
import { NodeSSH } from 'node-ssh';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ssh = new NodeSSH();
const localDir = path.join(__dirname, 'dist');
const remoteDir = process.env.REMOTE_DIR || '/var/www/flowify';

async function deploy() {
  try {
    await ssh.connect({
      host: process.env.SFTP_HOST,
      port: process.env.SFTP_PORT || '22',
      username: process.env.SFTP_USERNAME,
      password: process.env.SFTP_PASSWORD
    });

    console.log('Starting upload...');
    await ssh.putDirectory(localDir, remoteDir, {
      recursive: true,
      tick: (localPath, remotePath, error) => {
        if (error) console.error(`Failed to upload ${localPath}`, error);
      }
    });
    console.log('Upload complete');

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    ssh.dispose();
  }
}

deploy();
