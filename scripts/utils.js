import fs from 'fs';
import path from 'path';
import { createDataItemSigner, message } from '@permaweb/aoconnect';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export function loadConfig() {
  const p = path.resolve(process.cwd(), 'config', 'config.json');
  if (!fs.existsSync(p))
    throw new Error(
      'Missing config/config.json. Copy from config.example.json'
    );
  const raw = fs.readFileSync(p, 'utf-8');
  return JSON.parse(raw);
}

export function getSigner() {
  const jwkPath = process.env.WALLET_PATH;
  if (!jwkPath)
    throw new Error('Set WALLET_PATH in .env to your Arweave JWK file');
  const jwk = JSON.parse(fs.readFileSync(path.resolve(jwkPath), 'utf-8'));
  return createDataItemSigner(jwk);
}

export async function send(target, tags, data = undefined) {
  const signer = getSigner();
  const res = await message({ process: target, signer, tags, data });
  console.log('Msg Id:', res);
  return res;
}
