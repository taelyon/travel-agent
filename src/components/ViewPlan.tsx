import React from 'react';
import { Dialog } from '@headlessui/react';
import DailyItinerary from './DailyItinerary';
import Recommendations from './Recommendations';

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
      <Dialog open={true} onClose={() => {}}>
        <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
          <Dialog.Title as="h3" className="text-2xl font-bold leading-6 text-gray-900">
            {plan.tripTitle}
          </Dialog.Title>
          <div className="mt-4 mb-6 p-4 bg-gray-100 rounded-lg">
            <p className="text-md text-gray-800">{plan.tripOverview}</p>
            <p className="mt-2 text-sm font-semibold text-gray-700">{plan.estimatedCost}</p>
          </div>
          <div className="mt-4 space-y-6">
            <DailyItinerary itinerary={plan.dailyItinerary} />
            <Recommendations title="추천 호텔" items={plan.hotelRecommendations} />
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default ViewPlan;