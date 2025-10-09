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

async function generatePlanStream(model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>, payload: any) {
  const { destination, startDate, endDate, mustVisitPlaces, country } = payload ?? {};
  const travelCountry = country || Country.JAPAN;

  const mustVisitText = Array.isArray(mustVisitPlaces) && mustVisitPlaces.length > 0
    ? `사용자가 반드시 방문하고 싶어 하는 장소는 다음과 같습니다:\n- ${mustVisitPlaces.join('\n- ')}\n이 장소들을 반드시 일정에 포함시켜 주세요.`
    : '사용자가 지정한 필수 방문 장소는 없습니다.';

  const hotelInstruction = `\n**숙소 추천에 대한 요청:**\n- 숙소는 가성비 좋은 호텔과 럭셔리한 5성급 호텔을 각각 2~3개씩 균형있게 추천해주세요.\n- 교통이 편리한 중심가에 위치해야 합니다.`;

  const transportationInstructions = `
**교통편 가이드에 대한 상세 지침:**
- 사용자가 요청한 여행지(${destination}) 내의 주요 도시 또는 지역 간 이동 방법을 중심으로 교통편 가이드를 작성해주세요.
- 예를 들어, 사용자가 '오사카 & 교토'를 요청했다면 오사카와 교토 간의 이동 방법을 상세히 다루어야 합니다.
- 사용자가 '부산'을 요청했다면, 서울에서 부산까지의 이동 방법을 안내해야 합니다.
- 각 교통수단(예: 기차, 버스, 항공편 등)의 장단점, 예상 소요 시간, 비용을 비교 분석하여 가장 효율적인 방법을 추천해주세요.`;

  const prompt = `
            당신은 ${travelCountry} 전문 여행 플래너입니다. ${startDate}부터 ${endDate}까지 ${travelCountry}의 ${destination}으로 떠나는 여행을 위한 상세한 계획을 세워주세요.
            ${mustVisitText}
            ${hotelInstruction}
            ${transportationInstructions}

            **주요 지침:**
            1.  **여행 제목 (tripTitle):** 여행의 전체적인 특징과 목적지가 잘 드러나는 매력적인 제목을 한 문장으로 작성해주세요.
            2.  **여행 개요 (tripOverview):** 전체 여행의 컨셉과 주요 활동을 요약하는 3~4문장의 개요를 작성해주세요.
            3.  **예상 비용 (estimatedCost):** ${travelCountry === Country.KOREA ? '교통비를 포함한' : '항공권을 제외한'} 1인 기준 총 예상 경비를 원화(KRW)로 제시해주세요.
            4.  **숙소와 맛집:** 실제 존재하는 장소의 이름으로, 각각 최소 5개 이상 추천해주세요.
            5.  **평점:** 모든 추천 장소에 5점 만점의 평점(rating)을 반드시 포함하고, 평점이 높은 순으로 정렬해주세요.
            6.  **상세 일정:** 하루 일정을 아침, 점심, 저녁 식사를 포함하여 최소 5개 이상의 시간대로 세분화하여 계획해주세요.
            7.  **현실적인 교통편 연계:** ${travelCountry === Country.KOREA 
              ? '선택한 교통수단의 실제 운행시간을 고려하여 현실적으로 작성해주세요. (예: KTX 실제 운행시간표 참고)' 
              : '국제공항 출발/도착 시간을 현실적으로 고려해주세요. (예: 출발 오전 9시 이후, 도착 저녁 8시 이전)'}
            8.  **교통편:** 각 일정(schedule) 항목마다 이동을 위한 구체적인 교통편 정보(예: 지하철 노선, 버스 번호, 도보 등), 예상 소요 시간, 예상 요금을 'transportation' 필드에 상세히 작성해주세요.
            9.  **일정 내용:** 각 활동 및 방문 장소에 대한 구체적인 설명, 예상 소요 시간, 팁 등을 **다섯 문장 이상**으로 아주 상세하게 작성해주세요.
            10. **동선:** 논리적이고 효율적인 동선으로 일정을 계획하고, 모든 필수 방문 장소를 포함해야 합니다.
            11. **교통편 가이드 (transportationGuide):** 대한민국 또는 일본 내 도시 간 이동 계획 시, 주요 교통수단(예: KTX, 신칸센, 버스, 자가용, 항공편 등)별 이용요령, 예상 소요 시간, 예상 비용을 비교 분석하여 추천 교통수단을 포함한 내용을 **객체 배열**로 구조화해주세요. 각 객체는 method(교통수단 이름), tips(이용요령), duration(소요시간), cost(비용), recommended(추천 여부, boolean) 필드를 포함해야 합니다. 그 외 국가의 경우, 이 필드는 null로 설정해주세요.

            12. **출력 형식:** 결과는 다른 설명이나 markdown 포맷 없이, 아래와 같은 순수한 JSON 형식으로만 반환해주세요.

            **JSON 출력 형식 예시:**
            {
              "tripTitle": "활기찬 도시와 아름다운 자연, 3박 4일 여행",
              "tripOverview": "이 3박 4일 여행은 도시의 활기찬 문화와 아름다운 자연 명소를 모두 경험할 수 있도록 설계되었습니다. 주요 관광지를 효율적으로 둘러보고, 현지 음식을 맛보며, 편안한 숙소에서 휴식을 취하는 것을 목표로 합니다.",
              "estimatedCost": "1인 기준 약 1,200,000원 (항공권 제외)",
              "dailyItinerary": [{
                "day": "1일차",
                "date": "2025-10-01",
                "theme": "도시 도착과 첫인상",
                "schedule": [
                  {
                    "time": "15:00",
                    "activity": "공항 도착 및 시내 이동",
                    "description": "공항에 도착하여 입국 심사를 마친 후 수하물을 찾습니다. 공항 내 표지판을 따라 대중교통 승강장으로 이동하세요. 미리 예매한 티켓을 교환하거나 현장에서 티켓을 구매하여 시내로 가는 급행 열차에 탑승합니다. 지정된 좌석에 앉아 편안하게 이동하며 창밖 풍경을 감상할 수 있습니다. 숙소 근처 역 도착 후에는 출구를 미리 확인해두면 편리합니다.",
                    "transportation": "공항 급행 열차, 약 45분 소요, 15,000원"
                  }
                ]
              }],
              "hotelRecommendations": [{ "name": "시티 센터 호텔", "area": "중심가", "priceRange": "15만원 ~ 25만원", "rating": 4.5, "notes": "주요 역과 직접 연결되어 교통이 매우 편리하며, 쇼핑과 관광에 최적의 위치를 자랑합니다." }],
              "transportationGuide": [
                {
                  "method": "KTX/SRT",
                  "tips": "가장 빠르고 시간을 정확하게 지킬 수 있는 방법입니다. 주말이나 명절에는 미리 예매하는 것이 좋으며, 역에서 바로 지하철 등 다른 대중교통으로 환승하기 편리합니다.",
                  "duration": "약 2시간 30분 ~ 3시간",
                  "cost": "약 59,800원 (편도, 일반실 기준)",
                  "recommended": true
                }
              ],
              "restaurantRecommendations": [{ "name": "중앙 시장 맛집", "area": "중앙 시장", "rating": 4.4, "notes": "현지인들이 즐겨 찾는 신선한 해산물 요리 전문점입니다. 항상 대기 줄이 길 수 있으니 식사 시간을 피해 방문하는 것이 좋습니다." }]
            }
        `;

  const result = await model.generateContentStream({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  return result.stream;
}

async function searchInfo(model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>, payload: any) {
  const { query } = payload ?? {};
  const prompt = `여행과 관련된 다음 질문에 대해 간결하고 유용한 답변을 한국어로 제공해주세요: "${query}"`;
  const result = await model.generateContent(prompt);
  return { status: 200, body: { result: result.response.text() } };
}

export async function handleTravelAction(action: string, payload: any, stream?: boolean) {
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
    const modelName = process.env.GENERATIVE_MODEL || 'gemini-2.5-flash';

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
      if (stream) {
        const stream = await generatePlanStream(model, payload);
        return { status: 200, body: stream, stream: true };
      } else {
        const stream = await generatePlanStream(model, payload);
        let fullText = '';
        for await (const chunk of stream) {
          fullText += chunk.text();
        }
        const json = extractJsonFromText(fullText);
        if (json) {
          try {
            return { status: 200, body: JSON.parse(json) };
          } catch (e) {
             console.error('Failed to parse AI response as JSON', { raw: fullText });
             return { status: 500, body: { error: AI_GENERATION_ERROR } };
          }
        }
        return { status: 500, body: { error: AI_GENERATION_ERROR } };
      }
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
