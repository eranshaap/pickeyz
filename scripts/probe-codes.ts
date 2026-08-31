import { makeDegemCode } from "../src/lib/mot/degem-code";
import { ownershipCode, originCode } from "../src/lib/mot/codes";

console.log(makeDegemCode(588, 182));      // the Mazda from the API
console.log(makeDegemCode("778", "343"));  // strings, the way a CSV gives them
console.log(makeDegemCode(null, null));    // a car with no code

console.log(ownershipCode("ליסינג"), ownershipCode("החכר"), ownershipCode(" סוחר "));
console.log(originCode(""), originCode('ביס לנהיגה"'), originCode("יבוא אישי-משומש"));

try {
  ownershipCode("מונית");
} catch (e) {
  console.log("expected failure:", (e as Error).message);
}