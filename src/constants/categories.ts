import { Category } from '@/types';

/**
 * Default expense/income categories shipped with MyFlow.
 * These match the IDs seeded in schema.ts.
 */
export const DEFAULT_CATEGORY_ICONS: Record<string, string> = {
  cat_food: 'restaurant',
  cat_transport: 'car',
  cat_shopping: 'bag',
  cat_bills: 'flash',
  cat_health: 'medical',
  cat_education: 'school',
  cat_entertainment: 'film',
  cat_groceries: 'basket',
  cat_rent: 'home',
  cat_emi: 'card',
  cat_misc_exp: 'ellipsis-horizontal',
  cat_salary: 'briefcase',
  cat_freelance: 'laptop',
  cat_investment: 'trending-up',
  cat_gift: 'gift',
  cat_misc_inc: 'add-circle',
};

export const ACCOUNT_TYPE_ICONS: Record<string, string> = {
  bank: 'business',
  upi: 'phone-portrait',
  cash: 'cash',
  credit: 'card',
  other: 'wallet',
};

export const AVATAR_COLORS = [
  '#B5A0FF', '#60A5FA', '#4ADE80', '#FB7185',
  '#FBBF24', '#34D399', '#F472B6', '#818CF8',
  '#A3E635', '#E879F9', '#FB923C', '#2DD4BF',
];
