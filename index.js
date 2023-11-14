const OpenAI = require('openai');
const style = require('./style.json');

const openai = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"]
});

function getMapArguments(layerId, name, value, filter, functionType) {

  if (functionType === "setPaintProperty") {
    return JSON.stringify({ layerId, name, value, functionType });
  } else if (functionType === "setFilter") {
    return JSON.stringify({ layerId, filter, functionType });
  } else {
    return JSON.stringify({ functionType: null });
  }
}

async function runConversation() {
  // Step 1: send the conversation and available functions to the model

  const userInitMessage = '高松市の避難所のデータの色を青に変更したいです。';
  
  const messages = [
    { role: "user", content: `以下の Mapbox Style Spec に準拠した style.json を解析して、ユーザーの命令に従って 地図のスタイルを変更して下さい。

    あなたが使えるのは、Mapbox GL JS のメソッドの setPaintProperty(layerId, name, value) と、setFilter(layerId, filter) です。

    setPaintProperty と setFilter どちらを使うかはを、あなたが決めてください。

    setPaintProperty を使う場合は、引数となる layerId、name、value の適切な値と functionType: setPaintProperty を返して下さい。

    setFilter を使う場合は、引数となる layerId、filter の適切な値と functionType: setFilter を返して下さい。

    アシスタントの回答は日本語で返して下さい。

    ユーザーの命令は、以下の通りです:
    ${userInitMessage}
        
    以下 が style.json です:
    ${JSON.stringify(style)}` },
  ];
  const tools = [
    {
      
      type: "function",
      function: {
        name: "get_map_style",
        description: "Get the arguments for map.setPaintProperty() or map.setFilter() to change the Mapbox GL JS's map style",
        parameters: {
          type: "object",
          properties: {
            layerId: {
              type: "string",
              description: "The layer ID to change",
            },
            name: {
              type: "string",
              description: "The paint property name to change",
            },
            value: {
              type: "string",
              description: "The paint property value to change",
            },
            filter: {
              type: "string",
              description: "The filter to change",
            },
            functionType: {
              type: "string",
              description: "The function type to change map style (setPaintProperty or setFilter)",
            },
          },
          required: ["functionType"],
        },
      },
    },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4-1106-preview",
    messages: messages,
    tools: tools,
    tool_choice: "auto", // auto is default, but we'll be explicit
  });
  const responseMessage = response.choices[0].message;

  // Step 2: check if the model wanted to call a function
  const toolCalls = responseMessage.tool_calls;

  if (responseMessage.tool_calls) {
    // Step 3: call the function
    // Note: the JSON response may not always be valid; be sure to handle errors
    const availableFunctions = {
      get_map_style: getMapArguments,
    }; // only one function in this example, but you can have multiple
    messages.push(responseMessage); // extend conversation with assistant's reply
    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      const functionToCall = availableFunctions[functionName];
      const functionArgs = JSON.parse(toolCall.function.arguments);
      const functionResponse = functionToCall(
        functionArgs.location,
        functionArgs.unit
      );
      messages.push({
        tool_call_id: toolCall.id,
        role: "tool",
        name: functionName,
        content: functionResponse,
      }); // extend conversation with function response
    }
    const secondResponse = await openai.chat.completions.create({
      model: "gpt-4-1106-preview",
      messages: messages,
    }); // get a new response from the model where it can see the function response
    return secondResponse.choices;
  }
}


runConversation().then(console.log).catch(console.error);