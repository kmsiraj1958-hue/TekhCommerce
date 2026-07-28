import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const BASE_DIR = path.resolve(__dirname, '../..');

export const config = {
  port: Number(process.env.PORT) || 5010,
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  adminUser: process.env.ADMIN_USER || 'kmsiraj',
  adminPass: process.env.ADMIN_PASS || '1234',
  whatsappNumber: process.env.WHATSAPP_NUMBER || '923284270904',
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  whatsappApiVersion: process.env.WHATSAPP_API_VERSION || 'v23.0',
  shopifySecretVogue: process.env.SHOPIFY_SECRET_VOGUE || '',
  shopifySecretSns: process.env.SHOPIFY_SECRET_SNS || '',
  mnpUserVogue: process.env.MNP_USER_VOGUE || '',
  mnpPassVogue: process.env.MNP_PASS_VOGUE || '',
  mnpUserSns: process.env.MNP_USER_SNS || '',
  mnpPassSns: process.env.MNP_PASS_SNS || '',
  mnpBase: 'https://mnpcourier.com/mycodapi',
  files: {
    products: path.join(BASE_DIR, 'products.json'),
    orders: path.join(BASE_DIR, 'orders.json'),
    inventory: path.join(BASE_DIR, 'inventory_movements.json'),
    adSpend: path.join(BASE_DIR, 'ad_spend.json'),
    mnpDaily: path.join(BASE_DIR, 'mnp_daily_reports.json'),
    mnpPayout: path.join(BASE_DIR, 'mnp_payout_reports.json'),
    weekly: path.join(BASE_DIR, 'weekly_reports.json'),
    uploads: path.join(BASE_DIR, 'uploads'),
    images: path.join(BASE_DIR, 'static', 'images'),
    autoReports: path.join(BASE_DIR, 'uploads', 'auto_reports'),
    archive: path.join(BASE_DIR, 'uploads', 'archive'),
  },
};
