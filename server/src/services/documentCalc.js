import { safeNumber } from '../utils/helpers.js';

export function money(value) {
  return Math.round(safeNumber(value) * 100) / 100;
}

/**
 * Shared arithmetic for A4 and thermal layouts.
 * Tax applies to (line subtotal − header discount). Shipping is added after tax unless tax_shipping is true.
 */
export function computeDocumentTotals({
  lines = [],
  discount = 0,
  shipping = 0,
  tax_rate = 0,
  tax_shipping = false,
} = {}) {
  if (!Array.isArray(lines) || !lines.length) {
    throw new Error('At least one line is required');
  }
  const headerDiscount = money(discount);
  const shippingCharge = money(shipping);
  const headerTaxRate = money(tax_rate);
  if (headerDiscount < 0 || shippingCharge < 0 || headerTaxRate < 0) {
    throw new Error('Discount, shipping and tax rate cannot be negative');
  }
  if (headerTaxRate > 100) throw new Error('Tax rate cannot exceed 100');

  const computedLines = lines.map((line, index) => {
    const qty = safeNumber(line.qty);
    const unitPrice = money(line.unit_price ?? line.price);
    const lineDiscount = money(line.discount);
    if (qty <= 0) throw new Error(`Line ${index + 1}: quantity must be greater than zero`);
    if (unitPrice < 0 || lineDiscount < 0) throw new Error(`Line ${index + 1}: price and discount cannot be negative`);
    const lineGross = money(qty * unitPrice);
    if (lineDiscount > lineGross) throw new Error(`Line ${index + 1}: discount exceeds line amount`);
    const lineAmount = money(lineGross - lineDiscount);
    return {
      sku: String(line.sku || line.code || '').trim(),
      description: String(line.description || line.title || line.name || line.display || line.sku || 'Item').trim(),
      qty,
      unit_price: unitPrice,
      discount: lineDiscount,
      line_gross: lineGross,
      line_amount: lineAmount,
    };
  });

  const subtotal = money(computedLines.reduce((sum, line) => sum + line.line_amount, 0));
  if (headerDiscount > subtotal) throw new Error('Header discount exceeds subtotal');
  const afterDiscount = money(subtotal - headerDiscount);
  const taxBase = money(afterDiscount + (tax_shipping ? shippingCharge : 0));
  const taxAmount = money(taxBase * (headerTaxRate / 100));
  const grandTotal = money(afterDiscount + shippingCharge + taxAmount);

  return {
    lines: computedLines,
    subtotal,
    discount: headerDiscount,
    shipping: shippingCharge,
    tax_rate: headerTaxRate,
    tax_shipping: Boolean(tax_shipping),
    tax_base: taxBase,
    tax_amount: taxAmount,
    grand_total: grandTotal,
  };
}

export function linesFromOrder(order = {}) {
  if (Array.isArray(order.items) && order.items.length) {
    return order.items.map((item) => ({
      sku: item.sku || item.code || '',
      description: item.title || item.display || item.name || item.sku || '',
      qty: item.qty,
      unit_price: item.price,
      discount: item.discount || 0,
    }));
  }
  const qty = safeNumber(order.qty) || 1;
  return [{
    sku: order.product_code || '',
    description: order.product_name || order.product_code || 'Order',
    qty,
    unit_price: qty ? money(safeNumber(order.price) / qty) : money(order.price),
    discount: 0,
  }];
}
