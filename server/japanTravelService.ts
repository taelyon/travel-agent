import fs from 'fs/promises';
import path from 'path';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { put, list, del } from '@vercel/blob';
import type { SavedPlan } from '../types';
import { Country } from '../types.js';

const AI_GENERATION_ERROR = 'AI 여행 계획을 생성하는 데 실패했습니다. 잠시 후 다시 시도해 주세요.';
const MISSING_API_KEY_ERROR = '서버에 API 키가 설정되지 않았습니다.';
const UNKNOWN_ERROR = '요청 처리 중 알 수 없는 오류가 발생했습니다.';

const LOCAL_DATA_DIR = path.join(process.cwd(), 'local-data');
const LOCAL_PLANS_PATH = path.join(LOCAL_DATA_DIR, 'plans.json');
const isBlobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const useLocalStore = !isBlobConfigured;

function extractJsonFromText(text: string): string | null {
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1).trim();

    let balance = 0;
    for (const char of candidate) {
      if (char === '{') {
        balance += 1;
      }
      if (char === '}') {
        balance -= 1;
      }
      if (balance < 0) {
        balance = -1;
        break;
      }
    }

    if (balance === 0) {
      return candidate;
    }
  }

  return null;
}

async function readLocalPlans(): Promise<SavedPlan[]> {
  try {
    const raw = await fs.readFile(LOCAL_PLANS_PATH, 'utf-8');
    const data = JSON.parse(raw) as SavedPlan[];
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[local-store] Failed to read plans:', error);
    }
    return [];
  }
}

async function writeLocalPlans(plans: SavedPlan[]) {
  await fs.mkdir(LOCAL_DATA_DIR, { recursive: true });
  await fs.writeFile(LOCAL_PLANS_PATH, JSON.stringify(plans, null, 2), 'utf-8');
}

async function getPlans(): Promise<{ status: number; body: SavedPlan[] }> {
  const plans: SavedPlan[] = useLocalStore
    ? await readLocalPlans()
    : await (async () => {
        const { blobs } = await list({ prefix: 'plans/' });
        return Promise.all(
          blobs.map(async (blob) => {
            const response = await fetch(blob.url);
            return response.json();
          })
        );
      })();

  plans.sort((a, b) => b.id - a.id);
  return {
    status: 200,
    body: plans.map((plan) => ({ ...plan, country: plan.country ?? Country.JAPAN })),
  };
}

async function savePlan(data: SavedPlan): Promise<{ status: number; body: SavedPlan[] }> {
  if (useLocalStore) {
    const plans = await readLocalPlans();
    const existingIndex = plans.findIndex((item) => item.id === data.id);
    if (existingIndex >= 0) {
      plans[existingIndex] = data;
    } else {
      plans.push(data);
    }
    await writeLocalPlans(plans);
    return getPlans();
  }

  const fileName = `plans/${data.id}.json`;
  await put(fileName, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
  });

  return getPlans();
}

async function deletePlan(planId: number): Promise<{ status: number; body: SavedPlan[] }> {
  if (useLocalStore) {
    const plans = await readLocalPlans();
    const filtered = plans.filter((plan) => plan.id !== planId);
    if (filtered.length !== plans.length) {
      await writeLocalPlans(filtered);
    }
    return getPlans();
  }

  const filePathToDelete = `plans/${planId}.json`;

  try {
    const { blobs } = await list({ prefix: 'plans/' });
    const blobToDelete = blobs.find((blob) => blob.pathname === filePathToDelete);

    if (blobToDelete) {
      await del(blobToDelete.url);
    }
  } catch (error) {
    console.error(`[deletePlan] Error during deletion process for ${filePathToDelete}:`, error);
  }

  return getPlans();
}

async function generatePlan(model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>, payload: any) {
  const { destination, startDate, endDate, mustVisitPlaces, country } = payload ?? {};
  const travelCountry = country || Country.JAPAN;

  const mustVisitText = Array.isArray(mustVisitPlaces) && mustVisitPlaces.length > 0
    ? `사용자가 반드시 방문하고 싶어 하는 장소는 다음과 같습니다:\n- ${mustVisitPlaces.join('\n- ')}\n이 장소들을 반드시 일정에 포함시켜 주세요.`
    : '사용자가 지정한 필수 방문 장소는 없습니다.';

  const hotelInstruction = destination === '오사카 & 교토'
    ? `\n**숙소 추천에 대한 특별 요청:**\n- 오사카역, 난바역, 교토역 근처 중심으로 추천해주세요.\n- 중학생 자녀와 함께 머무르기 좋은 곳이어야 합니다.\n- 가성비를 가장 중요한 요소로 고려해주세요.`
    : `\n**숙소 추천에 대한 일반 요청:**\n- 교통이 편리한 중심가에 위치한 호텔을 추천해주세요.\n- 가성비를 중요한 요소로 고려해주세요.`;

  const prompt = `
            당신은 ${travelCountry} 전문 여행 플래너입니다. ${startDate}부터 ${endDate}까지 ${travelCountry}의 ${destination}으로 떠나는 여행을 위한 상세한 계획을 세워주세요. 출발지는 대한민국 서울입니다.
            ${mustVisitText}
            ${hotelInstruction}

            **주요 지침:**
            1.  **숙소와 맛집:** 실제 존재하는 장소의 이름으로, 각각 최소 5개 이상 추천해주세요.
            2.  **평점:** 모든 추천 장소에 5점 만점의 평점(rating)을 반드시 포함하고, 평점이 높은 순으로 정렬해주세요.
            3.  **상세 일정:** 하루 일정을 아침, 점심, 저녁 식사를 포함하여 최소 5개 이상의 시간대로 세분화하여 계획해주세요.
            4.  **교통편:** 각 일정(schedule) 항목마다 이동을 위한 구체적인 교통편 정보(예: 지하철 노선, 버스 번호, 도보 등), 예상 소요 시간, 예상 요금을 'transportation' 필드에 상세히 작성해주세요.
            5.  **일정 내용:** 각 활동 및 방문 장소에 대한 구체적인 설명, 예상 소요 시간, 팁 등을 **다섯 문장 이상**으로 아주 상세하게 작성해주세요.
            6.  **동선:** 논리적이고 효율적인 동선으로 일정을 계획하고, 모든 필수 방문 장소를 포함해야 합니다.
            7.  **출력 형식:** 결과는 다른 설명이나 markdown 포맷 없이, 아래와 같은 순수한 JSON 형식으로만 반환해주세요.

            **JSON 출력 형식 예시:**
            {
              "tripTitle": "오사카 미식과 교토의 고즈넉함을 담은 3박 4일",
              "dailyItinerary": [{
                "day": "1일차",
                "date": "2025-09-15",
                "theme": "오사카 도착과 도톤보리의 밤",
                "schedule": [
                  {
                    "time": "15:00",
                    "activity": "간사이 국제공항 도착 및 난카이 전철 탑승",
                    "description": "간사이 국제공항에 도착하여 입국 심사를 마친 후 수하물을 찾습니다. 공항 내 표지판을 따라 난카이 전철역으로 이동하세요. 미리 예매한 티켓을 교환하거나 현장에서 티켓을 구매하여 '라피트' 특급열차에 탑승합니다. 지정된 좌석에 앉아 편안하게 난바역까지 약 40분간 이동하며 창밖 풍경을 감상할 수 있습니다. 난바역 도착 후에는 숙소 방향 출구를 미리 확인해두면 편리합니다.",
                    "transportation": "난카이 공항선 급행 (난바 행), 약 45분 소요, 930엔"
                  }
                ]
              }],
              "hotelRecommendations": [{ "name": "호텔 닛코 오사카", "area": "신사이바시", "priceRange": "20만원 ~ 30만원", "rating": 4.5, "notes": "신사이바시 역과 직접 연결되어 교통이 매우 편리하며, 쇼핑과 관광에 최적의 위치를 자랑합니다." }],
              "transportationGuide": "이 여행에서는 오사카 주유패스와 간사이 쓰루패스를 활용하는 것이 좋습니다. 오사카 시내에서는 주유패스로 대부분의 지하철과 버스를 무제한 이용할 수 있으며, 교토 이동 및 관광 시에는 간사이 쓰루패스가 유용합니다. 각 패스의 가격, 구매처, 사용 가능 노선 등 상세 정보는 여행 전 미리 확인하는 것을 추천합니다.",
              "restaurantRecommendations": [{ "name": "이치란 도톤보리점", "area": "도톤보리", "rating": 4.4, "notes": "개인 맞춤형 주문이 가능한 돈코츠 라멘 전문점입니다. 항상 대기 줄이 길 수 있으니 식사 시간을 피해 방문하는 것이 좋습니다." }]
            }
        `;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const textResponse = result.response.text();
  const candidates = [textResponse.trim()];
  const extracted = extractJsonFromText(textResponse);

  if (extracted && extracted !== candidates[0]) {
    candidates.push(extracted);
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      return { status: 200, body: parsed };
    } catch {
      // try next candidate
    }
  }

  console.error('Failed to parse AI response as JSON', { raw: textResponse });
  return { status: 500, body: { error: AI_GENERATION_ERROR } };
}

async function searchInfo(model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>, payload: any) {
  const { query } = payload ?? {};
  const prompt = `일본 여행과 관련된 다음 질문에 대해 간결하고 유용한 답변을 한국어로 제공해주세요: "${query}"`;
  const result = await model.generateContent(prompt);
  return { status: 200, body: { result: result.response.text() } };
}

export async function handleJapanTravelAction(action: string, payload: any) {
  try {
    if (action === 'getPlans') {
      return getPlans();
    }

    if (action === 'savePlan') {
      return savePlan(payload as SavedPlan);
    }

    if (action === 'deletePlan') {
      const planId = payload?.planId;
      if (typeof planId !== 'number') {
        return { status: 400, body: { error: 'planId가 올바르지 않습니다.' } };
      }
      return deletePlan(planId);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { status: 500, body: { error: MISSING_API_KEY_ERROR } };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GENERATIVE_MODEL || 'gemini-1.5-flash';

    const model = genAI.getGenerativeModel({
      model: modelName,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ],
    });

    if (action === 'generatePlan') {
      return generatePlan(model, payload);
    }

    if (action === 'searchInfo') {
      return searchInfo(model, payload);
    }

    return { status: 400, body: { error: 'Invalid action' } };
  } catch (error) {
    console.error('API Error:', error);
    const message = error instanceof Error ? error.message : UNKNOWN_ERROR;
    return { status: 500, body: { error: message } };
  }
}
