exports.handler = async (event = {}) => {
  if (event.httpMethod && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: '' };
  }

  const body = String(event.body || '').slice(0, 6000);
  if (body) {
    console.warn('CSP report-only violation:', body);
  }

  return { statusCode: 204, body: '' };
};
