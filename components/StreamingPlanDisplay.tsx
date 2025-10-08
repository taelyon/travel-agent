import React from 'react';

interface StreamingPlanDisplayProps {
  content: string;
}

const StreamingPlanDisplay: React.FC<StreamingPlanDisplayProps> = ({ content }) => {
  return (
    <div className="w-full bg-gray-900 text-white p-6 rounded-lg font-mono text-sm whitespace-pre-wrap overflow-x-auto">
      <h2 className="text-lg font-bold text-yellow-400 mb-4">AI가 실시간으로 계획을 생성하고 있습니다...</h2>
      <p>{content}</p>
    </div>
  );
};

export default StreamingPlanDisplay;
