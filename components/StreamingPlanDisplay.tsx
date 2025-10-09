import React from 'react';
import { TravelPlan } from '../types';

interface StreamingPlanDisplayProps {
  content: string;
}

function parsePartialJson(jsonString: string): Partial<TravelPlan> {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    // In case of incomplete JSON, we'll try to recover what we can.
    // This is a simplified approach. A more robust solution might involve a streaming JSON parser.
    const plan: Partial<TravelPlan> = {};
    const titleMatch = jsonString.match(/"tripTitle":\s*"(.*?)"/);
    if (titleMatch && titleMatch[1]) plan.tripTitle = titleMatch[1];

    const overviewMatch = jsonString.match(/"tripOverview":\s*"(.*?)"/s);
    if (overviewMatch && overviewMatch[1]) plan.tripOverview = overviewMatch[1];

    const costMatch = jsonString.match(/"estimatedCost":\s*"(.*?)"/);
    if (costMatch && costMatch[1]) plan.estimatedCost = costMatch[1];

    return plan;
  }
}

const StreamingPlanDisplay: React.FC<StreamingPlanDisplayProps> = ({ content }) => {
  const plan = parsePartialJson(content);

  const renderSchedule = () => {
    if (!plan.dailyItinerary) return null;
    return plan.dailyItinerary.map((day, index) => (
      <div key={index} className="mb-4">
        <h3 className="text-xl font-bold text-rose-600">{day.day} <span className="text-gray-500 font-medium">({day.date})</span></h3>
        <p className="text-lg text-gray-600 italic">"{day.theme}"</p>
        <div className="relative border-l-2 border-rose-200 ml-3 pl-6 space-y-4 mt-2">
          {day.schedule?.map((item, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-[34px] top-1.5 w-4 h-4 bg-white rounded-full border-2 border-rose-500"></div>
              <p className="font-semibold text-gray-800">{item.time} - {item.activity}</p>
              <p className="text-gray-600 pl-1">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    ));
  };

  return (
    <div className="w-full bg-white p-6 rounded-lg font-sans">
      <h2 className="text-lg font-bold text-yellow-500 mb-4">AI가 실시간으로 계획을 생성하고 있습니다...</h2>
      
      {plan.tripTitle && <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight mb-4">{plan.tripTitle}</h1>}

      {(plan.tripOverview || plan.estimatedCost) && (
        <div className="p-4 bg-gray-100 rounded-lg mb-6">
          {plan.tripOverview && <p className="text-gray-800 mb-2">{plan.tripOverview}</p>}
          {plan.estimatedCost && <p className="font-semibold text-gray-700">{plan.estimatedCost}</p>}
        </div>
      )}

      {plan.dailyItinerary && (
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">상세 일정</h2>
          {renderSchedule()}
        </div>
      )}

      {/* A placeholder for other sections that will appear as the stream continues */}
      {!plan.dailyItinerary && content.length > 500 && (
          <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
              </div>
          </div>
      )}
    </div>
  );
};

export default StreamingPlanDisplay;