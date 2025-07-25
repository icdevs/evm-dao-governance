import {test; expect; testsys;} "mo:test/async";


import EvmDaoBridge "../src"


await test("evmdaobridge test", func() : async() {

  

  let result = EvmDaoBridge.test();
  expect.nat(result).equal(1); // Assuming the test method returns 0 for success


});