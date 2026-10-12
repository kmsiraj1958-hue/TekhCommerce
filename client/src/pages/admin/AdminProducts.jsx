import { useEffect, useState } from 'react';
import { api, imageUrl } from '../../api/client';

const emptyForm = {
  name: '', code: '', price: '', cost: '', category: '', opening_stock: '0', reorder_level: '3', image: null,
  item_type: 'FINISHED_GOOD', base_uom: 'pcs', hide_from_store: false,
};

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState('');

  function load() {
    api.getProducts().then((data) => setProducts(data.products || []));
  }

  useEffect(() => { load(); }, []);

  function toFormData(data) {
    const fd = new FormData();
    Object.entries(data).forEach(([key, val]) => {
      if (val != null && val !== '' && key !== 'image') fd.append(key, val);
    });
    if (data.image instanceof File) fd.append('image', data.image);
    return fd;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editing) {
        await api.updateProduct(editing, toFormData(form));
        setMessage('Product updated');
      } else {
        await api.createProduct(toFormData(form));
        setMessage('Product added');
      }
      setForm(emptyForm);
      setEditing(null);
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  function startEdit(product) {
    setEditing(product.code);
    setForm({
      name: product.name,
      code: product.code,
      price: product.price,
      cost: product.cost,
      category: product.category || '',
      opening_stock: product.opening_stock || 0,
      reorder_level: product.reorder_level || 3,
      item_type: product.item_type || 'FINISHED_GOOD',
      base_uom: product.base_uom || 'pcs',
      hide_from_store: product.hide_from_store || false,
      image: null,
    });
  }

  async function remove(code) {
    if (!window.confirm(`Delete product ${code}?`)) return;
    await api.deleteProduct(code);
    load();
  }

  return (
    <div>
      <h1 className="page-title">Products</h1>
      <p className="page-subtitle">Add, edit, and manage your product catalog.</p>
      {message && <div className="alert alert-success">{message}</div>}

      <form className="card" style={{ padding: 24, marginBottom: 24 }} onSubmit={handleSubmit}>
        <h2 style={{ marginTop: 0 }}>{editing ? `Edit ${editing}` : 'Add New Product'}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div className="field"><label className="label">Name</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label className="label">Code</label><input className="input" required disabled={!!editing} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div className="field"><label className="label">Price</label><input className="input" type="number" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
          <div className="field"><label className="label">Cost</label><input className="input" type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
          <div className="field"><label className="label">Category</label><input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div className="field"><label className="label">Opening Stock</label><input className="input" type="number" step="0.000001" value={form.opening_stock} onChange={(e) => setForm({ ...form, opening_stock: e.target.value })} /></div>
          <div className="field"><label className="label">Reorder Level</label><input className="input" type="number" step="0.000001" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} /></div>
          <div className="field">
            <label className="label">Item type</label>
            <select className="select" value={form.item_type} onChange={(e) => setForm({ ...form, item_type: e.target.value, hide_from_store: e.target.value !== 'FINISHED_GOOD' })}>
              <option value="FINISHED_GOOD">Finished good</option>
              <option value="RAW_MATERIAL">Raw material</option>
              <option value="PACKAGING_MATERIAL">Packaging</option>
            </select>
          </div>
          <div className="field"><label className="label">Base UOM</label><input className="input" value={form.base_uom} onChange={(e) => setForm({ ...form, base_uom: e.target.value })} /></div>
          <div className="field"><label className="label">Image</label><input className="input" type="file" accept="image/*" onChange={(e) => setForm({ ...form, image: e.target.files?.[0] || null })} /></div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button type="submit" className="btn btn-primary">{editing ? 'Save Changes' : 'Add Product'}</button>
          {editing && <button type="button" className="btn btn-secondary" onClick={() => { setEditing(null); setForm(emptyForm); }}>Cancel</button>}
        </div>
      </form>

      <div className="card table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Image</th><th>Code</th><th>Name</th><th>Type</th><th>Price</th><th>Stock</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.code}>
                <td><img src={imageUrl(p.image)} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }} /></td>
                <td>{p.code}</td>
                <td>{p.name}</td>
                <td>{p.item_type || 'FINISHED_GOOD'}</td>
                <td>Rs {Number(p.price).toLocaleString()}</td>
                <td>{p.live_stock ?? p.opening_stock ?? 0}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(p)}>Edit</button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(p.code)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
