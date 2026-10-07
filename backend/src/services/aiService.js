// For calliln OpenAI API to autofill food descriptions

import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Nah need convert this into image this for testing rn though; will probs pull from S3
export const generateFoodDescription = async (foodName) => {
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that generates food descriptions.",
        },
        {
          role: "user",
          content: `Generate a short, appealing description for ${foodName}.`,
        },
      ],
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error generating food description:", error);
    throw error;
  }
};