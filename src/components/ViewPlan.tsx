import React from 'react';

interface Plan {
  tripTitle: string;
  tripOverview: string;
  estimatedCost: string;
  dailyItinerary: any[];
  hotelRecommendations: any[];
}

interface ViewPlanProps {
  plan: Plan;
}

const ViewPlan: React.FC<ViewPlanProps> = ({ plan }) => {
  return (
    <div>
      <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
        <h3 className="text-2xl font-bold leading-6 text-gray-900">
          {plan.tripTitle}
        </h3>
        <div className="mt-4 mb-6 p-4 bg-gray-100 rounded-lg">
          <p className="text-md text-gray-800">{plan.tripOverview}</p>
          <p className="mt-2 text-sm font-semibold text-gray-700">{plan.estimatedCost}</p>
        </div>
        <div className="mt-4 space-y-6">
          <p>여행 계획 상세 내용이 여기에 표시됩니다.</p>
        </div>
      </div>
    </div>
  );
};

export default ViewPlan;