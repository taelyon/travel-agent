import React from 'react';

interface Plan {
  tripTitle: string;
  tripOverview: string;
  estimatedCost: string;
  dailyItinerary: any;
  hotelRecommendations: any;
}

interface PlanGeneratorProps {
  plan: Plan | null;
  isGenerating: boolean;
}

const PlanGenerator: React.FC<PlanGeneratorProps> = ({ plan, isGenerating }) => {
  return (
    <div>
      {plan && !isGenerating && (
        <div className="mt-8">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl mb-4">{plan.tripTitle}</h2>
          
          <div className="mt-4 mb-6 p-4 bg-gray-100 rounded-lg">
            <p className="text-lg text-gray-800">{plan.tripOverview}</p>
            <p className="mt-2 text-md font-semibold text-gray-700">{plan.estimatedCost}</p>
          </div>

          <div className="space-y-8">
            <p>여행 계획 상세 내용이 여기에 표시됩니다.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanGenerator;