const Sentiment = require('sentiment');
const analyzer = new Sentiment();

// Advanced feature #1: lightweight cognitive-services-style sentiment
// analysis applied to every comment as it is posted. In a full cloud
// deployment this call could be swapped for a managed cognitive service
// (e.g. AWS Comprehend / Azure Text Analytics) without changing the
// calling code, since it just needs to return { score, label }.
function analyzeSentiment(text) {
  const result = analyzer.analyze(text);
  // Normalise the raw AFINN score into a -1..1 comparative-style score
  const score = result.comparative || 0;

  let label = 'neutral';
  if (score > 0.15) label = 'positive';
  else if (score < -0.15) label = 'negative';

  return { score: Number(score.toFixed(2)), label };
}

module.exports = { analyzeSentiment };
