import { getAccessToken } from './authService';

export const fetchRecentConfirmations = async (destination?: string, startDate?: string, endDate?: string) => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  // Base travel keywords
  let query = 'subject:reservation OR subject:confirmation OR subject:flight OR subject:hotel OR subject:itinerary OR "booking reference" OR "confirmation number" OR "boarding pass"';
  
  // If a destination is provided, try to search for it specifically to increase relevance
  if (destination) {
    const cleanDest = destination.replace(/2026|2025|Adventure|Trip|NYC|New York/gi, (match) => {
       if (match.toLowerCase().includes('nyc') || match.toLowerCase().includes('new york')) return match; // Keep NYC/New York
       return '';
    }).trim();
    if (cleanDest) {
      query = `(${cleanDest}) (${query})`;
    }
  }

  // Date range filtering: scan for emails received around the trip period or recently
  // Usually, reservations are received BEFORE the trip.
  // If we have trip dates, we should look for emails received in the last 6 months up to the trip end date
  if (endDate) {
    const end = new Date(endDate);
    if (!isNaN(end.getTime())) {
      const beforeDate = new Date(end);
      beforeDate.setDate(beforeDate.getDate() + 2); // Buffer
      const beforeStr = beforeDate.toISOString().split('T')[0].replace(/-/g, '/');
      query += ` before:${beforeStr}`;
    }
  }

  // 1. Search for recent emails
  console.log(`[GmailService] Searching with query: ${query}`);
  const searchRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!searchRes.ok) {
    throw new Error(`Gmail API error: ${searchRes.statusText}`);
  }
  
  const searchData = await searchRes.json();
  if (!searchData.messages || searchData.messages.length === 0) {
    return [];
  }

  // 2. Fetch the full content of those emails
  const emails = [];
  for (const msg of searchData.messages) {
    const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const msgData = await msgRes.json();
    emails.push(parseEmailContent(msgData));
  }
  
  return emails;
};

// Very basic parsing to get subject, date, and text body
function parseEmailContent(message: any) {
  const headers = message.payload.headers;
  const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
  const date = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || '';
  const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
  
  let body = '';
  
  // Gmail message payload parts could be nested
  function extractBody(parts: any[]) {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body.data) {
        body += decodeBase64(part.body.data) + '\n';
      } else if (part.parts) {
        extractBody(part.parts);
      }
    }
  }
  
  if (message.payload.parts) {
    extractBody(message.payload.parts);
  } else if (message.payload.body && message.payload.body.data) {
    body = decodeBase64(message.payload.body.data);
  }
  
  // Truncate body if it's too long
  if (body.length > 5000) {
    body = body.substring(0, 5000) + '... [truncated]';
  }
  
  return { subject, date, from, body };
}

function decodeBase64(str: string) {
  // Replace base64url characters with base64 characters
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(escape(atob(base64)));
  } catch (e) {
    try {
      return atob(base64);
    } catch (err) {
      return '';
    }
  }
}
