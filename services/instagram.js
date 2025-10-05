const axios = require('axios');

/**
 * Create media container on Instagram Graph API
 * @param {Object} params
 * @param {string} params.ig_user_id - Instagram user id
 * @param {string} params.access_token - Access token
 * @param {string} params.type - 'image' | 'video'
 * @param {string} params.sourceUrl - Publicly accessible URL for media
 * @param {string} [params.caption]
 */
async function createMediaContainer({ ig_user_id, access_token, type, sourceUrl, caption = '' }) {
  const endpoint = `https://graph.instagram.com/v21.0/${ig_user_id}/media`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${access_token}`,
  };
  const payload =
    type === 'video'
      ? { media_type: 'REELS', video_url: sourceUrl, caption }
      : { image_url: sourceUrl, caption };

  try {
    const { data } = await axios.post(endpoint, payload, { headers, timeout: 30000 });
    return data; // { id: creation_id }
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    const msg = `IG create container failed${status ? ` (status ${status})` : ''}: ${JSON.stringify(body) || err.message}`;
    throw new Error(msg);
  }
}

/**
 * Publish container
 */
async function publishContainer({ ig_user_id, access_token, creation_id }) {
  const endpoint = `https://graph.instagram.com/v21.0/${ig_user_id}/media_publish`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${access_token}`,
  };
  const payload = { creation_id };
  try {
    const { data } = await axios.post(endpoint, payload, { headers, timeout: 30000 });
    return data; // { id: media_id }
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    const msg = `IG publish failed${status ? ` (status ${status})` : ''}: ${JSON.stringify(body) || err.message}`;
    throw new Error(msg);
  }
}

/**
 * Get container status_code
 */
async function getContainerStatus({ access_token, creation_id }) {
  const endpoint = `https://graph.instagram.com/v21.0/${creation_id}`;
  const headers = { Authorization: `Bearer ${access_token}` };
  const params = { fields: 'status_code' };
  try {
    const { data } = await axios.get(endpoint, { headers, params, timeout: 15000 });
    // status_code examples: IN_PROGRESS, FINISHED, ERROR
    return data?.status_code || 'UNKNOWN';
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    const msg = `IG status check failed${status ? ` (status ${status})` : ''}: ${JSON.stringify(body) || err.message}`;
    throw new Error(msg);
  }
}

/**
 * Wait until container is ready to publish or timeout
 */
async function waitForContainerReady({ access_token, creation_id, timeoutMs = 120000, intervalMs = 3000 }) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await getContainerStatus({ access_token, creation_id });
    if (status === 'FINISHED' || status === 'READY') return status;
    if (status === 'ERROR') throw new Error('IG container processing error');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('IG container not ready before timeout');
}

module.exports = { createMediaContainer, publishContainer, getContainerStatus, waitForContainerReady };
