import type { Problem } from './problem';
export const seeds: Problem[] = [
  {
    id: 'two-sum',
    title: 'Two Sum',
    difficulty: 'Easy',
    tags: ['Arrays', 'Hash map'],
    statement:
      'Given an array of integers nums and an integer target, return the indices of two distinct elements whose sum equals target.\n\nExactly one valid pair exists. You may return its indices in either order. The same element cannot be used twice.',
    constraints: [
      '2 ≤ nums.length ≤ 10⁴',
      '−10⁹ ≤ nums[i], target ≤ 10⁹',
      'Exactly one pair exists.',
    ],
    assumptions: [
      'Indices are zero-based. The input array must not be modified.',
    ],
    parameters: ['nums', 'target'],
    starter: {
      python:
        'def solve(nums, target):\n    # Return the indices of the two numbers.\n    pass\n',
      javascript:
        'function solve(nums, target) {\n    // Return the indices of the two numbers.\n}\n',
    },
    reference: {
      python:
        'def solve(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n',
      javascript:
        'function solve(nums, target) { const seen = new Map(); for (let i=0;i<nums.length;i++){ if(seen.has(target-nums[i])) return [seen.get(target-nums[i]),i]; seen.set(nums[i],i); } }',
    },
    hints: [
      'For each number, what value would complete the pair?',
      'Can you remember the numbers you have already visited?',
      'A map from number to index makes each lookup constant time on average.',
    ],
    explanation:
      'Scan once, looking up target − current in a map of previously seen values. Check before inserting so one element cannot be reused. Return the earlier index and the current index.',
    complexity: 'O(n) expected time · O(n) extra space',
    comparison: 'unordered',
    tests: [
      { args: [[2, 7, 11, 15], 9], expected: [0, 1], label: 'Example 1' },
      { args: [[3, 2, 4], 6], expected: [1, 2], label: 'Example 2' },
      { args: [[3, 3], 6], expected: [0, 1], label: 'Duplicate values' },
      ...Array.from({ length: 20 }, (_, i) => ({
        args: [[-100 - i, 200 + i, 3000], 100],
        expected: [0, 1],
        label: `Mixed signs ${i + 1}`,
      })),
      { args: [[0, 4, 3, 0], 0], expected: [0, 3], label: 'Two zeros' },
      {
        args: [Array.from({ length: 1000 }, (_, i) => i), 1997],
        expected: [998, 999],
        label: 'Large input',
      },
    ],
    sources: [],
    verification: 'built-in',
  },
  {
    id: 'valid-brackets',
    title: 'Valid Brackets',
    difficulty: 'Easy',
    tags: ['Strings', 'Stack'],
    statement:
      'Given a string s containing only parentheses, square brackets and curly braces, decide whether it is balanced. Every opening bracket must close with the same bracket type, in the correct order. Return a boolean.',
    constraints: ['0 ≤ s.length ≤ 10⁴', 'Only the characters ()[]{} appear.'],
    assumptions: ['An empty string is balanced.'],
    parameters: ['s'],
    starter: {
      python: 'def solve(s):\n    pass\n',
      javascript: 'function solve(s) {\n}\n',
    },
    reference: {
      python:
        'def solve(s):\n    stack = []\n    pairs = {")": "(", "]": "[", "}": "{"}\n    for c in s:\n        if c in pairs:\n            if not stack or stack.pop() != pairs[c]:\n                return False\n        else:\n            stack.append(c)\n    return not stack\n',
      javascript:
        'function solve(s) {const stack=[];const pairs={")":"(","]":"[","}":"{"};for(const c of s){if(c in pairs){if(stack.pop()!==pairs[c])return false;}else stack.push(c);}return stack.length===0;}',
    },
    hints: [
      'The most recently opened bracket should close first.',
      'A stack models last-in, first-out order.',
    ],
    explanation:
      'Push openings onto a stack. For a closing bracket, pop and compare its matching opening. Reject mismatches and leftover openings.',
    complexity: 'O(n) time · O(n) space',
    comparison: 'exact',
    tests: [
      ['()', true],
      ['([]{})', true],
      ['([)]', false],
      ['', true],
      ['(', false],
      [']', false],
      ['()[]{}', true],
      ['((()))', true],
      ['(()', false],
      ['())', false],
      ['[({})]', true],
      ['('.repeat(1000) + ')'.repeat(1000), true],
    ].map(([s, expected], i) => ({
      args: [s],
      expected,
      label: i < 2 ? `Example ${i + 1}` : `Edge case ${i - 1}`,
    })),
    sources: [],
    verification: 'built-in',
  },
];
