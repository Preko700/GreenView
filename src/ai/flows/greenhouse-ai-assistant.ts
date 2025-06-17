
'use server';
/**
 * @fileOverview An AI agent that provides advice on maintaining plants in a portable greenhouse.
 *
 * - provideGreenhouseAdvice - A function that provides advice based on current conditions.
 * - ProvideGreenhouseAdviceInput - The input type for the provideGreenhouseAdvice function.
 * - ProvideGreenhouseAdviceOutput - The return type for the provideGreenhouseAdvice function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ProvideGreenhouseAdviceInputSchema = z.object({
  temperature: z.number().describe('The current temperature in Celsius.'),
  airHumidity: z.number().describe('The current air humidity as a percentage.'),
  soilHumidity: z.number().describe('The current soil humidity as a percentage.'),
  lightLevel: z.number().describe('The current light level in lux.'),
  plantType: z.string().describe('The type of plant being grown.'),
  location: z.string().describe('The geographical location of the greenhouse.'),
});
export type ProvideGreenhouseAdviceInput = z.infer<typeof ProvideGreenhouseAdviceInputSchema>;

const ProvideGreenhouseAdviceOutputSchema = z.object({
  advice: z.string().describe('Specific advice on how to adjust greenhouse settings to best care for the plants.'),
});
export type ProvideGreenhouseAdviceOutput = z.infer<typeof ProvideGreenhouseAdviceOutputSchema>;

export async function provideGreenhouseAdvice(input: ProvideGreenhouseAdviceInput): Promise<ProvideGreenhouseAdviceOutput> {
  return provideGreenhouseAdviceFlow(input);
}

const prompt = ai.definePrompt({
  name: 'provideGreenhouseAdvicePrompt',
  input: {schema: ProvideGreenhouseAdviceInputSchema},
  output: {schema: ProvideGreenhouseAdviceOutputSchema},
  prompt: `You are an expert horticulturalist providing advice on maintaining optimal conditions inside a portable greenhouse.

  Based on the current environmental conditions, provide specific advice to the user on how to adjust their greenhouse settings to best care for their plants. Be specific and actionable. Consider the plant type and location when giving advice.

Current Conditions:
Temperature: {{{temperature}}}°C
Air Humidity: {{{airHumidity}}}%
Soil Humidity: {{{soilHumidity}}}%
Light Level: {{{lightLevel}}} lux
Plant Type: {{{plantType}}}
Location: {{{location}}}

Advice:`,
});

const provideGreenhouseAdviceFlow = ai.defineFlow(
  {
    name: 'provideGreenhouseAdviceFlow',
    inputSchema: ProvideGreenhouseAdviceInputSchema,
    outputSchema: ProvideGreenhouseAdviceOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    if (!output) {
      throw new Error("AI failed to generate advice in the expected format. The response from the model might be empty or not match the defined output schema.");
    }
    return output;
  }
);
