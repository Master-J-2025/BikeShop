const STORAGE_KEYS = {
  clients: 'admin_clients',
  orders: 'admin_orders',
  requests: 'bikeshop_requests',
  invoices: 'admin_invoices',
  config: 'admin_config',
  darkMode: 'admin_dark'
};

const defaultConfig = {
  storeName: 'BikeShop',
  phone: '',
  email: '',
  address: '',
  policy: '',
  waMessage: 'Hola, tu pedido está en proceso. Número de seguimiento: {pedido}',
  logoUrl: 'icon.png'
};

const defaultClients = [];
const defaultOrders = [];
const defaultInvoices = [];

const SUPABASE_URL = 'https://vjyjpldllxctthxujxwo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_UZzyrkER1ZptcTUuNwNyqA_oiKCvQUc';
let supabaseClient = null;

let clients = [];
let orders = [];
let requests = [];
let products = [];
let invoices = [];
let config = { ...defaultConfig };
let currentFilter = 'todos';
let currentOrderTypeFilter = 'all';

function initSupabase() {
  if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes('tu-proyecto')) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
}

function persistToLocalStorage() {
  localStorage.setItem(STORAGE_KEYS.clients, JSON.stringify(clients));
  localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(orders));
  localStorage.setItem(STORAGE_KEYS.requests, JSON.stringify(requests));
  localStorage.setItem(STORAGE_KEYS.invoices, JSON.stringify(invoices));
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(config));
}

function loadData() {
  const savedClients = JSON.parse(localStorage.getItem(STORAGE_KEYS.clients) || 'null');
  const savedOrders = JSON.parse(localStorage.getItem(STORAGE_KEYS.orders) || 'null');
  const savedRequests = JSON.parse(localStorage.getItem(STORAGE_KEYS.requests) || 'null');
  const savedInvoices = JSON.parse(localStorage.getItem(STORAGE_KEYS.invoices) || 'null');
  const savedConfig = JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || 'null');
  const savedProducts = JSON.parse(localStorage.getItem('bikeshop_prods') || '[]');

  clients = Array.isArray(savedClients) && savedClients.length ? savedClients : defaultClients.slice();
  orders = Array.isArray(savedOrders) && savedOrders.length ? savedOrders : defaultOrders.slice();
  requests = Array.isArray(savedRequests) ? savedRequests : [];
  invoices = Array.isArray(savedInvoices) && savedInvoices.length ? savedInvoices : defaultInvoices.slice();
  products = Array.isArray(savedProducts) ? savedProducts : [];
  config = savedConfig ? { ...defaultConfig, ...savedConfig } : { ...defaultConfig };
  updateBrandFromConfig();
}

function saveData() {
  persistToLocalStorage();
  pushToSupabase().catch((err) => console.warn('Error sincronizando con Supabase', err));
}

async function pushToSupabase() {
  if (!supabaseClient) return;
  try {
    await Promise.all([
      supabaseClient.from('clients').upsert(clients, { onConflict: 'id' }),
      supabaseClient.from('orders').upsert(orders, { onConflict: 'id' }),
      supabaseClient.from('requests').upsert(requests.map((request) => ({
        ...request,
        items: JSON.stringify(request.items || []),
        related_products: request.related_products || JSON.stringify(request.items || [])
      })), { onConflict: 'id' }),
      supabaseClient.from('invoices').upsert(invoices, { onConflict: 'id' }),
      supabaseClient.from('admin_config').upsert([{ id: 1, ...config }], { onConflict: 'id' })
    ]);
  } catch (error) {
    console.warn('Supabase sync failed', error);
  }
}

async function syncDataFromSupabase() {
  if (!supabaseClient) return;
  try {
        const [{ data: remoteClients, error: clientsError },
           { data: remoteOrders, error: ordersError },
         { data: remoteRequests, error: requestsError },
           { data: remoteInvoices, error: invoicesError },
           { data: remoteProducts, error: productsError },
           { data: remoteConfig, error: configError }] = await Promise.all([
      supabaseClient.from('clients').select('*'),
      supabaseClient.from('orders').select('*'),
       supabaseClient.from('requests').select('*').order('id', { ascending: true }),
      supabaseClient.from('invoices').select('*'),
      supabaseClient.from('products').select('*').order('id', { ascending: true }),
      supabaseClient.from('admin_config').select('*').limit(1)
    ]);

    if (!clientsError && Array.isArray(remoteClients) && remoteClients.length) {
      clients = remoteClients;
    }
    if (!ordersError && Array.isArray(remoteOrders) && remoteOrders.length) {
      orders = remoteOrders;
    }
    if (!requestsError && Array.isArray(remoteRequests)) {
      requests = remoteRequests.map((request) => ({
        ...request,
        items: parseRequestItems(request.items),
        total: Number(request.total) || 0,
        status: request.status || 'pendiente',
        products: request.product || formatRequestItems(request.items),
        delivery: request.delivery || 'pendiente'
      }));
      await syncRequestClients();
    }
    if (!invoicesError && Array.isArray(remoteInvoices) && remoteInvoices.length) {
      invoices = remoteInvoices;
    }
    if (!productsError && Array.isArray(remoteProducts) && remoteProducts.length) {
      products = remoteProducts;
      localStorage.setItem('bikeshop_prods', JSON.stringify(products));
    }
    if (!configError && Array.isArray(remoteConfig) && remoteConfig.length) {
      config = { ...defaultConfig, ...remoteConfig[0] };
    }
    persistToLocalStorage();
    updateBrandFromConfig();
    renderDashboard();
    renderClients();
    renderOrders(currentFilter);
    renderInvoices();
  } catch (error) {
    console.warn('Supabase load failed', error);
  }
}

function getDisplayOrders() {
  return [
    ...orders.map((order) => ({ ...order, recordType: 'order' })),
    ...requests.map((request) => ({
      ...request,
      clientId: getClientForRecord(request)?.id || request.id,
      recordType: 'request'
    }))
  ];
}

function hasOrderForRequest(requestId) {
  return orders.some((order) => String(order.request_id || order.requestId) === String(requestId));
}

function formatRequestItems(items) {
  const parsedItems = parseRequestItems(items);
  if (!parsedItems.length) return 'Solicitud web';
  return parsedItems.map((item) => `${item.qty || 1}x ${item.name || 'Producto'}`).join(', ');
}

function parseRequestItems(items) {
  if (!items) return [];
  try {
    const parsedItems = typeof items === 'string' ? JSON.parse(items || '[]') : items;
    return Array.isArray(parsedItems) ? parsedItems : [];
  } catch (error) {
    return [];
  }
}

function getClientForRecord(record) {
  if (!record) return null;
  return clients.find((client) => client.id === record.clientId)
    || clients.find((client) => record.whatsapp && client.phone === record.whatsapp)
    || null;
}

async function syncRequestClients() {
  const newClients = [];
  requests.forEach((request) => {
    if (!request.whatsapp) return;
    const existingClient = clients.find((client) => client.phone === request.whatsapp);
    if (existingClient) return;
    const client = {
      id: Number(request.id),
      name: `${request.name || ''} ${request.lastName || ''}`.trim() || 'Cliente web',
      phone: request.whatsapp,
      email: request.email || '',
      address: request.address || '',
      notes: 'Cliente registrado desde solicitud web',
      created_at: request.created_at || request.date || new Date().toISOString()
    };
    clients.push(client);
    newClients.push(client);
  });
  if (newClients.length && supabaseClient) {
    const { error } = await supabaseClient.from('clients').upsert(newClients, { onConflict: 'id' });
    if (error) console.warn('No se pudieron sincronizar los clientes web', error);
  }
}

function navigateTo(section) {
  document.querySelectorAll('.section-page').forEach((sectionNode) => sectionNode.classList.add('hidden'));
  const target = document.getElementById('seccion-' + section);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.sidebar a').forEach((link) => link.classList.remove('active'));
  const activeLink = document.querySelector(`.sidebar a[data-section="${section}"]`);
  if (activeLink) activeLink.classList.add('active');

  if (section === 'dashboard') {
    renderDashboard();
  } else if (section === 'clientes') {
    renderClients();
  } else if (section === 'pedidos') {
    renderOrders();
    syncDataFromSupabase().catch((err) => console.warn('No se pudieron actualizar las solicitudes', err));
  } else if (section === 'facturacion') {
    renderInvoices();
  } else if (section === 'configuracion') {
    loadConfig();
  }

  closeSidebar();
}

function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar || !overlay) return;
  sidebar.classList.add('open');
  overlay.classList.remove('hidden');
  document.body.classList.add('menu-open');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.add('hidden');
  document.body.classList.remove('menu-open');
}

function renderDashboard() {
  const displayOrders = getDisplayOrders();
  const pending = displayOrders.filter((o) => o.status === 'pendiente').length;
  const delivering = displayOrders.filter((o) => o.status === 'en entrega').length;
  const delivered = displayOrders.filter((o) => o.status === 'entregado').length;
  const totalClients = clients.length;

  document.getElementById('dashboardCards').innerHTML = `
    <div class="card bg-white rounded-xl shadow p-4"><p class="text-gray-500 text-sm">Pendientes</p><p class="text-3xl font-bold text-warning">${pending}</p></div>
    <div class="card bg-white rounded-xl shadow p-4"><p class="text-gray-500 text-sm">En entrega</p><p class="text-3xl font-bold text-blue-500">${delivering}</p></div>
    <div class="card bg-white rounded-xl shadow p-4"><p class="text-gray-500 text-sm">Entregados</p><p class="text-3xl font-bold text-success">${delivered}</p></div>
    <div class="card bg-white rounded-xl shadow p-4"><p class="text-gray-500 text-sm">Clientes</p><p class="text-3xl font-bold text-primary">${totalClients}</p></div>
  `;

  const recentOrdersHtml = displayOrders.slice(-5).reverse().map((order) => `
    <div class="flex justify-between items-center border-b pb-2 text-sm">
      <span><strong>#${order.id}</strong> - ${order.clientName || 'N/A'}</span>
      <span class="badge-status status-${order.status.replace(/\s+/g, '-')}">${order.status}</span>
    </div>
  `).join('') || '<p class="text-gray-500">Sin pedidos</p>';

  const recentClientsHtml = clients.slice(-5).reverse().map((client) => `
    <div class="flex justify-between items-center border-b pb-2 text-sm">
      <span><strong>${client.name}</strong></span>
      <span class="text-gray-500">${client.phone}</span>
    </div>
  `).join('') || '<p class="text-gray-500">Sin clientes</p>';

  document.getElementById('recentOrders').innerHTML = recentOrdersHtml;
  document.getElementById('recentClients').innerHTML = recentClientsHtml;
}

function renderClients() {
  const search = document.getElementById('clientSearch')?.value.toLowerCase() || '';
  const filteredClients = clients.filter((client) => {
    return client.name.toLowerCase().includes(search) || client.phone.includes(search);
  });

  document.getElementById('clientsTable').innerHTML = filteredClients.map((client) => `
    <tr class="border-b table-row">
      <td class="p-3">${client.name}</td>
      <td class="p-3">${client.phone}</td>
      <td class="p-3">${client.email || '-'}</td>
      <td class="p-3">${client.address || '-'}</td>
      <td class="p-3 flex gap-2">
        <button type="button" onclick="editClient(${client.id})" class="text-blue-500"><i class="fas fa-edit"></i></button>
        <button type="button" onclick="deleteClient(${client.id})" class="text-red-500"><i class="fas fa-trash"></i></button>
        <a href="https://wa.me/${client.phone.replace(/\D/g, '')}" target="_blank" class="text-green-500"><i class="fab fa-whatsapp"></i></a>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="p-4 text-center text-gray-500">No hay clientes registrados</td></tr>';
}

function openClientForm() {
  document.getElementById('clientModal').classList.remove('hidden');
  document.getElementById('editClientId').value = '';
  document.getElementById('clientModal').querySelector('form').reset();
}

function closeClientModal() {
  document.getElementById('clientModal').classList.add('hidden');
}

function editClient(id) {
  const client = clients.find((item) => item.id === id);
  if (!client) return;
  document.getElementById('editClientId').value = client.id;
  document.getElementById('clientName').value = client.name;
  document.getElementById('clientPhone').value = client.phone;
  document.getElementById('clientEmail').value = client.email || '';
  document.getElementById('clientAddress').value = client.address || '';
  document.getElementById('clientModal').classList.remove('hidden');
}

function saveClient(event) {
  event.preventDefault();

  const id = document.getElementById('editClientId').value;
  const clientData = {
    id: id ? parseInt(id, 10) : Date.now(),
    name: document.getElementById('clientName').value.trim(),
    phone: document.getElementById('clientPhone').value.trim(),
    email: document.getElementById('clientEmail').value.trim(),
    address: document.getElementById('clientAddress').value.trim(),
    notes: ''
  };

  if (!clientData.name || !clientData.phone) return;

  if (id) {
    const index = clients.findIndex((item) => item.id === clientData.id);
    if (index !== -1) clients[index] = clientData;
  } else {
    clients.push(clientData);
  }

  saveData();
  closeClientModal();
  renderClients();
  renderDashboard();
  Swal.fire({ icon: 'success', title: 'Cliente guardado', timer: 1500, showConfirmButton: false });
  event.target.reset();
}

function deleteClient(id) {
  Swal.fire({ title: '¿Eliminar cliente?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' }).then((result) => {
    if (!result.isConfirmed) return;
    clients = clients.filter((item) => item.id !== id);
    saveData();
    renderClients();
    renderDashboard();
  });
}

function setOrderFilterButtons(status) {
  document.querySelectorAll('.order-filter-btn').forEach((btn) => {
    const isActive = btn.dataset.filter === status;
    btn.classList.toggle('bg-orange-500', isActive);
    btn.classList.toggle('text-white', isActive);
  });
}

function renderOrders(filter = currentFilter) {
  currentFilter = filter;
  setOrderFilterButtons(currentFilter);
  const allOrders = getDisplayOrders();
  const typedOrders = currentOrderTypeFilter === 'all'
    ? allOrders
    : allOrders.filter((order) => order.recordType === currentOrderTypeFilter);
  const filteredOrders = filter === 'todos' ? typedOrders : typedOrders.filter((order) => order.status === filter);

  document.getElementById('ordersTable').innerHTML = filteredOrders.map((order) => {
    const client = getClientForRecord(order);
    const orderActions = order.recordType === 'request'
      ? `${hasOrderForRequest(order.id) ? '<span class="text-gray-400 text-xs">Convertida</span>' : `<button type="button" onclick="convertRequestToOrder(${order.id})" class="text-orange-500" title="Convertir en pedido"><i class="fas fa-exchange-alt"></i></button>`}`
      : `<button type="button" onclick="editOrder(${order.id})" class="text-blue-500" title="Editar pedido"><i class="fas fa-edit"></i></button>
          <button type="button" onclick="deleteOrder(${order.id})" class="text-red-500" title="Eliminar pedido"><i class="fas fa-trash"></i></button>
          <button type="button" onclick="generateInvoiceFromOrder(${order.id})" class="text-purple-500" title="Generar factura"><i class="fas fa-file-invoice"></i></button>`;
    return `
      <tr class="border-b table-row">
        <td class="p-3 font-bold">#${order.id}</td>
        <td class="p-3">${client ? client.name : (order.name ? `${order.name} ${order.lastName || ''}`.trim() : 'Desconocido')}</td>
        <td class="p-3 text-sm">${order.products}</td>
        <td class="p-3">$${(Number(order.total) || 0).toFixed(2)}</td>
        <td class="p-3">${order.delivery === 'domicilio' ? 'Domicilio' : 'Tienda'}</td>
        <td class="p-3"><span class="badge-status status-${order.status.replace(/\s+/g, '-')}">${order.status}</span></td>
        <td class="p-3 flex gap-2 flex-wrap">
          ${orderActions}
          ${client ? `<a href="https://wa.me/${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(config.waMessage.replace('{pedido}', order.id))}" target="_blank" class="text-green-500"><i class="fab fa-whatsapp"></i></a>` : ''}
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="7" class="p-4 text-center text-gray-500">No hay pedidos</td></tr>';
}

function setOrderTypeFilterButtons(type) {
  document.querySelectorAll('.order-type-filter-btn').forEach((button) => {
    const active = button.dataset.typeFilter === type;
    button.classList.toggle('bg-orange-500', active);
    button.classList.toggle('text-white', active);
  });
}

function filterOrderType(type) {
  currentOrderTypeFilter = type;
  setOrderTypeFilterButtons(type);
  renderOrders(currentFilter);
}

function filterOrders(status, event) {
  renderOrders(status);
}

async function convertRequestToOrder(requestId) {
  const request = requests.find((item) => String(item.id) === String(requestId));
  if (!request || hasOrderForRequest(requestId)) return;
  const client = getClientForRecord(request);
  if (!client) {
    Swal.fire({ icon: 'warning', title: 'Cliente no encontrado', text: 'La solicitud debe tener un cliente asociado antes de convertirla.' });
    return;
  }
  const items = parseRequestItems(request.items);
  const firstItem = items[0];
  const product = products.find((item) => (firstItem?.id && String(item.id) === String(firstItem.id))
    || (firstItem?.name && item.name?.toLowerCase() === firstItem.name.toLowerCase()));
  const order = {
    id: Date.now(),
    request_id: request.id,
    clientId: client.id,
    clientName: client.name,
    productId: product?.id || firstItem?.id || null,
    productImage: product?.image || firstItem?.image || '',
    products: product?.name || firstItem?.name || request.product || formatRequestItems(request.items),
    qty: Number(firstItem?.qty || request.quantity || 1),
    total: Number(request.total) || 0,
    delivery: request.delivery || 'tienda',
    status: 'pendiente',
    deliveryDate: '',
    notes: request.comment || '',
    createdAt: request.created_at || request.date || new Date().toISOString()
  };
  orders.push(order);
  request.status = 'atendida';
  saveData();
  renderOrders(currentFilter);
  renderDashboard();
  Swal.fire({ icon: 'success', title: 'Solicitud convertida', text: `Pedido #${order.id} creado correctamente.`, timer: 1800, showConfirmButton: false });
}

function openOrderForm() {
  const select = document.getElementById('orderClient');
  const productSelect = document.getElementById('orderProducts');
  const orderForm = document.querySelector('#orderModal form');
  select.innerHTML = clients.map((client) => `<option value="${client.id}">${client.name} (${client.phone})</option>`).join('');
  populateOrderProducts(productSelect);
  if (orderForm) orderForm.reset();
  document.getElementById('editOrderId').value = '';
  document.getElementById('orderModal').classList.remove('hidden');
}

function populateOrderProducts(select, selectedProduct = '') {
  if (!select) return;
  select.innerHTML = '<option value="">Selecciona un producto</option>' + products.map((product) => `
    <option value="${product.id}" ${String(product.id) === String(selectedProduct) ? 'selected' : ''}>
      ${product.name} - $${Number(product.price || 0).toFixed(2)}${product.stock === 'low' ? ' - Poco stock' : ''}
    </option>
  `).join('');
}

function closeOrderModal() {
  document.getElementById('orderModal').classList.add('hidden');
}

function editOrder(id) {
  const order = orders.find((item) => item.id === id);
  if (!order) return;
  document.getElementById('editOrderId').value = order.id;
  document.getElementById('orderClient').innerHTML = clients.map((client) => `
    <option value="${client.id}" ${client.id === order.clientId ? 'selected' : ''}>${client.name} (${client.phone})</option>
  `).join('');
  const product = products.find((item) => String(item.id) === String(order.productId)
    || item.name === order.products);
  populateOrderProducts(document.getElementById('orderProducts'), product?.id || '');
  document.getElementById('orderQty').value = order.qty || 1;
  document.getElementById('orderTotal').value = order.total || '';
  document.getElementById('orderDelivery').value = order.delivery;
  document.getElementById('orderStatus').value = order.status;
  document.getElementById('orderDeliveryDate').value = order.deliveryDate || '';
  document.getElementById('orderNotes').value = order.notes || '';
  document.getElementById('orderModal').classList.remove('hidden');
}

function saveOrder(event) {
  event.preventDefault();
  const id = document.getElementById('editOrderId').value;
  const clientId = parseInt(document.getElementById('orderClient').value, 10);
  const client = clients.find((item) => item.id === clientId);
  const productId = document.getElementById('orderProducts').value;
  const product = products.find((item) => String(item.id) === String(productId));
  const quantity = parseInt(document.getElementById('orderQty').value, 10) || 1;
  const orderData = {
    id: id ? parseInt(id, 10) : Date.now(),
    clientId,
    clientName: client ? client.name : 'Desconocido',
    productId: product ? product.id : null,
    productImage: product?.image || '',
    products: product ? product.name : '',
    qty: quantity,
    total: parseFloat(document.getElementById('orderTotal').value) || (Number(product?.price || 0) * quantity),
    delivery: document.getElementById('orderDelivery').value,
    status: document.getElementById('orderStatus').value,
    deliveryDate: document.getElementById('orderDeliveryDate').value,
    notes: document.getElementById('orderNotes').value.trim(),
    createdAt: id ? orders.find((item) => item.id === parseInt(id, 10))?.createdAt : new Date().toISOString().slice(0, 10)
  };

  if (!orderData.products || !clientId) return;

  if (id) {
    const index = orders.findIndex((item) => item.id === orderData.id);
    if (index !== -1) orders[index] = orderData;
  } else {
    orders.push(orderData);
  }

  saveData();
  closeOrderModal();
  renderOrders();
  renderDashboard();
  Swal.fire({ icon: 'success', title: 'Pedido guardado', timer: 1500, showConfirmButton: false });
  event.target.reset();
}

function deleteOrder(id) {
  Swal.fire({ title: '¿Eliminar pedido?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' }).then((result) => {
    if (!result.isConfirmed) return;
    orders = orders.filter((item) => item.id !== id);
    saveData();
    renderOrders();
    renderDashboard();
  });
}

function renderInvoices() {
  document.getElementById('invoicesTable').innerHTML = invoices.map((invoice) => {
    const client = clients.find((item) => item.id === invoice.clientId);
    return `
      <tr class="border-b table-row">
        <td class="p-3 font-bold">#${invoice.id}</td>
        <td class="p-3">${invoice.date}</td>
        <td class="p-3">${client ? client.name : '-'}</td>
        <td class="p-3">#${invoice.orderId}</td>
        <td class="p-3">$${invoice.total.toFixed(2)}</td>
        <td class="p-3"><span class="badge-status ${invoice.payment === 'pagado' ? 'status-entregado' : 'status-pendiente'}">${invoice.payment}</span></td>
        <td class="p-3 flex gap-2">
          <button type="button" onclick="deleteInvoice(${invoice.id})" class="text-red-500"><i class="fas fa-trash"></i></button>
          <button type="button" onclick="printInvoice(${invoice.id})" class="text-blue-500"><i class="fas fa-print"></i></button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="7" class="p-4 text-center text-gray-500">No hay facturas</td></tr>';
}

function generateInvoiceFromOrder(orderId) {
  const order = getDisplayOrders().find((item) => item.id === orderId);
  if (!order) return;
  const client = getClientForRecord(order);
  document.getElementById('invoiceOrderId').value = orderId;
  document.getElementById('invoiceOrderDisplay').value = `#${orderId}`;
  document.getElementById('invoiceClientDisplay').value = client?.name || order.clientName || order.name || '';
  document.getElementById('invoiceDetail').value = order.products;
  document.getElementById('invoiceModal').dataset.orderItems = JSON.stringify(order.items || []);
  document.getElementById('invoiceTotal').value = order.total || 0;
  document.getElementById('invoicePayment').value = 'pendiente';
  document.getElementById('invoiceModal').classList.remove('hidden');
}

function closeInvoiceModal() {
  document.getElementById('invoiceModal').classList.add('hidden');
}

function saveInvoice(event) {
  event.preventDefault();
  const orderId = parseInt(document.getElementById('invoiceOrderId').value, 10);
  const order = getDisplayOrders().find((item) => item.id === orderId);
  const client = getClientForRecord(order);
  const orderProduct = products.find((product) => String(product.id) === String(order?.productId));
  const invoice = {
    id: Date.now(),
    orderId,
    clientId: client ? client.id : null,
    date: new Date().toISOString().slice(0, 10),
    detail: document.getElementById('invoiceDetail').value.trim(),
    items: JSON.parse(document.getElementById('invoiceModal').dataset.orderItems || '[]').length
      ? JSON.parse(document.getElementById('invoiceModal').dataset.orderItems || '[]')
      : (orderProduct ? [{ id: orderProduct.id, name: orderProduct.name, qty: order.qty || 1, price: orderProduct.price, image: orderProduct.image }] : []),
    total: parseFloat(document.getElementById('invoiceTotal').value) || 0,
    payment: document.getElementById('invoicePayment').value
  };
  invoices.push(invoice);
  saveData();
  closeInvoiceModal();
  renderInvoices();
  Swal.fire({ icon: 'success', title: 'Factura emitida', timer: 1500, showConfirmButton: false });
  event.target.reset();
}

function deleteInvoice(id) {
  Swal.fire({ title: '¿Eliminar factura?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' }).then((result) => {
    if (!result.isConfirmed) return;
    invoices = invoices.filter((item) => item.id !== id);
    saveData();
    renderInvoices();
  });
}

function printInvoice(id) {
  const invoice = invoices.find((item) => item.id === id);
  if (!invoice) return;
  const client = clients.find((item) => item.id === invoice.clientId);
  const logoUrl = new URL(config.logoUrl || 'icon.png', window.location.href).href;
  const logoHtml = `<img src="${logoUrl}" alt="Logo" style="width:56px;height:56px;border-radius:8px;object-fit:cover;">`;
  const items = Array.isArray(invoice.items) && invoice.items.length
    ? invoice.items
    : (invoice.detail || '').split(',').map((name) => ({ name: name.trim(), qty: 1 })).filter((item) => item.name);
  const itemsHtml = items.length ? items.map((it) => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px dashed #eee">
        ${(() => {
          const itemName = String(it.name || it).toLowerCase();
          const product = products.find((catalogProduct) => {
            const catalogName = String(catalogProduct.name || '').toLowerCase();
            return (it.id && String(catalogProduct.id) === String(it.id))
              || (catalogName && (itemName.includes(catalogName) || catalogName.includes(itemName)));
          });
          const imageUrl = new URL(product?.image || it.image || 'icon.png', window.location.href).href;
          return `<img src="${imageUrl}" alt="${it.name || 'Producto'}" style="width:48px;height:48px;border-radius:8px;object-fit:cover;border:1px solid #f1f5f9;">`;
        })()}
        <div style="flex:1">
          <div style="font-weight:600">${it.name || it}</div>
          <div style="color:#6b7280;font-size:13px">Cantidad: ${it.qty || 1}</div>
        </div>
        <div style="font-weight:700">$${it.price != null ? Number(it.price).toFixed(2) : (invoice.total && items.length === 1 ? invoice.total.toFixed(2) : '')}</div>
      </div>
    `).join('') : `<div style="padding:12px 0;color:#6b7280">No hay detalles específicos</div>`;

  const html = `
    <html>
      <head>
        <meta charset="utf-8">
        <title>Recibo #${invoice.id}</title>
        <style>
          :root{ --primary: ${JSON.stringify(config.brandPrimary||'#2c3e50')}; --accent: ${JSON.stringify(config.brandAccent||'#e74c3c')}; }
          body{font-family: Inter, system-ui, Arial, sans-serif; background:#f8fafc; margin:0; padding:30px; color:#0f172a}
          .card{max-width:720px;margin:20px auto;background:white;border-radius:12px;box-shadow:0 6px 30px rgba(2,6,23,0.08);overflow:hidden}
          .card-header{display:flex;flex-direction:column;align-items:center;padding:28px 30px;background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,0));}
          .store-title{display:flex;align-items:center;gap:12px;font-size:20px;font-weight:800;color:var(--accent)}
          .subtitle{font-weight:700;color:#111827;margin-top:6px}
          .meta{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px;color:#475569}
          .content{padding:22px 30px}
          .products{margin-top:12px}
          .total-row{display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid #eef2f7;margin-top:18px}
          .btns{display:flex;gap:10px;margin-top:18px}
          .btn{padding:10px 14px;border-radius:8px;border:none;cursor:pointer}
          .btn-print{background:var(--accent);color:white}
          .btn-back{background:#64748b;color:white}
        </style>
      </head>
      <body>
        <div class="card">
          <div class="card-header">
            <div class="store-title">${logoHtml}<div style="display:flex;flex-direction:column;align-items:flex-start"><div style="font-size:18px;color:var(--accent)">${config.storeName || 'Server Home'}</div><div style="font-size:13px;color:#6b7280">Recibo de Pedido</div></div></div>
            <div class="meta">
              <div><strong>ID:</strong> #${invoice.id}</div>
              <div><strong>Cliente:</strong> ${client ? client.name : 'N/A'}</div>
              <div><strong>Fecha:</strong> ${invoice.date}</div>
              <div><strong>Estado:</strong> ${invoice.payment}</div>
            </div>
          </div>
          <div class="content">
            <h3 style="margin:0 0 8px 0">Productos:</h3>
            <div class="products">
              ${itemsHtml}
            </div>
            <div class="total-row">
              <div style="font-weight:700">Total:</div>
              <div style="font-size:20px;font-weight:800">$${invoice.total.toFixed(2)}</div>
            </div>
            <div class="btns">
              <button class="btn btn-print" onclick="window.print()">Imprimir recibo</button>
              <button class="btn btn-back" onclick="window.close()">Volver a pedidos</button>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
}

function loadConfig() {
  document.getElementById('configStoreName').value = config.storeName || '';
  document.getElementById('configBrandTagline').value = config.brandTagline || '';
  document.getElementById('configBrandPrimary').value = config.brandPrimary || '#2c3e50';
  document.getElementById('configBrandAccent').value = config.brandAccent || '#e74c3c';
  document.getElementById('configPhone').value = config.phone || '';
  document.getElementById('configEmail').value = config.email || '';
  document.getElementById('configAddress').value = config.address || '';
  document.getElementById('configPolicy').value = config.policy || '';
  document.getElementById('configWaMessage').value = config.waMessage || '';
  document.getElementById('configLogoUrl').value = config.logoUrl || '';
  const preview = document.getElementById('configLogoPreview');
  if (preview) { preview.src = config.logoUrl || ''; preview.style.display = config.logoUrl ? 'block' : 'none'; }
}

function saveConfig(event) {
  event.preventDefault();
  config = {
    storeName: document.getElementById('configStoreName').value.trim(),
    brandTagline: document.getElementById('configBrandTagline').value.trim(),
    brandPrimary: document.getElementById('configBrandPrimary').value || '#2c3e50',
    brandAccent: document.getElementById('configBrandAccent').value || '#e74c3c',
    phone: document.getElementById('configPhone').value.trim(),
    email: document.getElementById('configEmail').value.trim(),
    address: document.getElementById('configAddress').value.trim(),
    policy: document.getElementById('configPolicy').value.trim(),
    waMessage: document.getElementById('configWaMessage').value.trim(),
    logoUrl: document.getElementById('configLogoUrl').value.trim()
  };
  updateBrandFromConfig();
  saveData();
  Swal.fire({ icon: 'success', title: 'Configuración guardada', timer: 1500, showConfirmButton: false });
}

function exportConfig() {
  try {
    const data = JSON.stringify(config, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'admin_config.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.warn('Export config failed', err);
    Swal.fire({ icon: 'error', title: 'Error exportando configuración' });
  }
}

function importConfigFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      config = { ...defaultConfig, ...parsed };
      updateBrandFromConfig();
      saveData();
      loadConfig();
      Swal.fire({ icon: 'success', title: 'Configuración importada', timer: 1500, showConfirmButton: false });
    } catch (err) {
      console.warn('Import config failed', err);
      Swal.fire({ icon: 'error', title: 'Archivo inválido' });
    }
  };
  reader.readAsText(file);
  // reset input so same file can be re-imported later
  event.target.value = '';
}

function updateBrandFromConfig() {
  const brandNameElement = document.getElementById('brandName');
  const brandTaglineElement = document.getElementById('brandTagline');
  if (brandNameElement) {
    brandNameElement.textContent = config.storeName || 'BikeShop Admin';
  }
  const mobileBrandNameElement = document.getElementById('mobileBrandName');
  if (mobileBrandNameElement) {
    mobileBrandNameElement.textContent = config.storeName || 'BikeShop Admin';
  }
  if (brandTaglineElement) {
    brandTaglineElement.textContent = config.brandTagline || 'Panel de administración';
  }
  document.documentElement.style.setProperty('--primary', config.brandPrimary || '#2c3e50');
  document.documentElement.style.setProperty('--accent', config.brandAccent || '#e74c3c');
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem(STORAGE_KEYS.darkMode, String(isDark));
  document.getElementById('darkIcon').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
  const mobileDarkIcon = document.getElementById('mobileDarkIcon');
  if (mobileDarkIcon) mobileDarkIcon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
}

function init() {
  initSupabase();
  loadData();
  if (localStorage.getItem(STORAGE_KEYS.darkMode) === 'true') {
    document.body.classList.add('dark');
    document.getElementById('darkIcon').className = 'fas fa-sun';
    const mobileDarkIcon = document.getElementById('mobileDarkIcon');
    if (mobileDarkIcon) mobileDarkIcon.className = 'fas fa-sun';
  }
  if (supabaseClient) {
    syncDataFromSupabase().catch((err) => console.warn('No se pudo cargar datos desde Supabase', err));
    window.setInterval(() => {
      syncDataFromSupabase().catch((err) => console.warn('No se pudieron actualizar los datos', err));
    }, 15000);
  }
  navigateTo('dashboard');
  loadConfig();
  document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);
  const mobileMenuButton = document.querySelector('.mobile-menu-button');
  if (mobileMenuButton) mobileMenuButton.addEventListener('click', openSidebar);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach((modal) => modal.classList.add('hidden'));
    }
  });
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.classList.add('hidden');
    });
  });
}

window.addEventListener('DOMContentLoaded', init);
