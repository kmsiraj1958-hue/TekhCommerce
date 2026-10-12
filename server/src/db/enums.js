/** Canonical values from the live JSON application — not invented aliases. */

export const ITEM_TYPES = ['FINISHED_GOOD', 'RAW_MATERIAL', 'PACKAGING_MATERIAL'];

export const MOVE_TYPE = {
  opening: 'OPENING',
  purchase: 'PURCHASE',
  manual_add: 'MANUAL_ADD',
  stock_in: 'STOCK_IN',
  dispatch: 'DISPATCH',
  stock_out: 'STOCK_OUT',
  return: 'RETURN_IN',
  return_in: 'RETURN_IN',
  damage: 'DAMAGE',
  adjustment: 'ADJUSTMENT_PLUS',
  adjustment_plus: 'ADJUSTMENT_PLUS',
  adjustment_minus: 'ADJUSTMENT_MINUS',
  consumption: 'CONSUMPTION',
  wastage: 'WASTAGE',
  production_in: 'PRODUCTION_IN',
  reversal_in: 'REVERSAL_IN',
  reversal_out: 'REVERSAL_OUT',
};

export const ORDER_STATUS = {
  Pending: 'PENDING',
  Confirmed: 'CONFIRMED',
  Booked: 'BOOKED',
  Shipped: 'SHIPPED',
  Delivered: 'DELIVERED',
  Returned: 'RETURNED',
};

/** Order flags — not stock-movement types. */
export const STOCK_FLAGS = ['stock_reserved', 'stock_restocked'];
