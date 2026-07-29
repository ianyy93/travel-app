import { refineLogic, updateGenAIKey } from "../../src/services/aiLogic";

export async function onRequest(context: any) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (typeof process === 'undefined') {
    globalThis.process = { env: {} } as any;
  } else if (!process.env) {
    process.env = {};
  }
  
  for (const key in env) {
    process.env[key] = env[key];
  }

  if (updateGenAIKey) {
    updateGenAIKey(process.env.GEMINI_API_KEY);
  }

  try {
    const body = await request.json();
    const req = { body };
    let responseStatus = 200;
    
    return new Promise((resolve) => {
      const res = {
        status: (code: number) => {
          responseStatus = code;
          return res;
        },
        json: (data: any) => {
          resolve(new Response(JSON.stringify(data), {
            status: responseStatus,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          }));
        },
        send: (data: any) => {
          resolve(new Response(data, {
            status: responseStatus,
            headers: {
              'Content-Type': 'text/plain',
              'Access-Control-Allow-Origin': '*'
            }
          }));
        }
      };
      
      refineLogic(req, res).catch((err: Error) => {
        console.error("Logic error:", err);
        resolve(new Response(JSON.stringify({ error: err.message }), { 
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }));
      });
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
