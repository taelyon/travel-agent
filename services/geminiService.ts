import { Destination, Country, type TravelPlan } from '../types';

const API_BASE_URL = '/api/travel';

/**
 * A generic function to make requests to the server API.
 * This is for non-streaming responses.
 */
async function fetchFromApi(action: string, payload: any) {
  try {
    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, payload, stream: false }), // Explicitly request non-streaming
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Cannot parse server response' }));
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`API request failed (${action}):`, error);
    throw error;
  }
}

/**
 * Requests a travel plan generation and receives the data as a stream.
 */
export const generateTravelPlanStream = async (
  country: Country,
  destination: Destination,
  startDate: string,
  endDate: string,
  mustVisitPlaces: string[],
  onData: (chunk: string) => void, // Callback to handle incoming data chunks
  onError: (error: Error) => void,
  onComplete: () => void
) => {
  try {
    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        action: 'generatePlan', 
        payload: { country, destination, startDate, endDate, mustVisitPlaces },
        stream: true, // Request a streaming response
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Cannot parse server response' }));
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Response body is missing');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      onData(chunk);
    }

    onComplete();

  } catch (error) {
    console.error('Streaming API request failed:', error);
    onError(error as Error);
  }
};


/**
 * Requests AI travel plan generation (non-streaming).
 */
export const generateTravelPlan = async (
  country: Country,
  destination: Destination,
  startDate: string,
  endDate: string,
  mustVisitPlaces: string[]
): Promise<TravelPlan> => {
  try {
    const plan = await fetchFromApi('generatePlan', { country, destination, startDate, endDate, mustVisitPlaces });
    return plan;
  } catch (error) {
     throw new Error("AI travel plan generation failed. Please try again later.");
  }
};

/**
 * Requests simple information search.
 */
export const searchInformation = async (query: string): Promise<string> => {
  try {
    const data = await fetchFromApi('searchInfo', { query });
    return data.result;
  } catch (error) {
    throw new Error("Information search failed. Please try again later.");
  }
};