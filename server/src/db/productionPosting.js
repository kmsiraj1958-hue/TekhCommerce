/**
 * Contract for a future PostgreSQL production post.
 * JSON manufacturing still writes two files and is not atomic.
 * Live services must not call this until cutover.
 */
export function productionPostingOperations(order) {
  if (order.status === 'posted') {
    return { duplicate: true, operations: [] };
  }
  const movements = [];
  for (const component of order.actual_components || []) {
    if (Number(component.consumed_qty) > 0) {
      movements.push({ type: 'CONSUMPTION', sku: component.sku, qty: component.consumed_qty });
    }
    if (Number(component.wastage_qty) > 0) {
      movements.push({ type: 'WASTAGE', sku: component.sku, qty: component.wastage_qty });
    }
  }
  movements.push({ type: 'PRODUCTION_IN', sku: order.finished_sku, qty: order.actual_output_qty });
  return {
    duplicate: false,
    atomic: true,
    operations: [
      { step: 'lock_production_order', status: 'POSTING' },
      { step: 'insert_stock_movements', movements },
      { step: 'update_finished_good_cost' },
      { step: 'set_posted', status: 'POSTED' },
      { step: 'write_posting_log' },
    ],
  };
}

export function productionReversalOperations(order) {
  if (order.status !== 'posted') {
    throw new Error('Only posted production can be reversed');
  }
  return {
    atomic: true,
    preserveOriginal: true,
    operations: [
      { step: 'insert_reversing_movements', types: ['REVERSAL_IN', 'REVERSAL_OUT'] },
      { step: 'set_reversed', status: 'REVERSED' },
      { step: 'write_posting_log', event: 'reversed' },
    ],
  };
}
