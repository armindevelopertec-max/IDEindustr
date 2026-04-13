from typing import Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import (
    ladder_generator,
    grafcet_engine,
    parser as grafcet_parser,
    variable_mapper,
)
from app.services.model_serializer import serialize_prompt


class TransitionSchema(BaseModel):
    source: str
    target: str
    condition: str
    action: str


class StepSchema(BaseModel):
    name: str
    actions: List[str]
    transitions: List[TransitionSchema]
    level: int

class CompiledSchema(BaseModel):
    definitions: List[str]
    transitions: List[str]
    updates: List[str]
    actions: List[str]
    execution_order: List[str]
    analysis: List[str]


class ParseRequest(BaseModel):
    text: str


class ParseResponse(BaseModel):
    steps: List[StepSchema]
    ladder: List[str]
    variables: Dict[str, str]
    compiled: CompiledSchema
    prompt: str


router = APIRouter()


@router.post("/parse", response_model=ParseResponse)
def parse_text(payload: ParseRequest) -> ParseResponse:
    try:
        pairs = grafcet_parser.parse_cnl(payload.text)
    except grafcet_parser.GrafcetSyntaxError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    steps = grafcet_engine.build_grafcet(pairs)
    ladder = ladder_generator.generate_ladder(steps)
    variables = variable_mapper.default_variable_map()
    compiled = grafcet_engine.compile_grafcet(steps)

    serialized_steps = [
            StepSchema(
                name=step.name,
                actions=step.actions,
                transitions=[
                    TransitionSchema(
                        source=t.source,
                        target=t.target,
                        condition=t.condition,
                        action=t.action,
                    )
                    for t in step.transitions
                ],
                level=step.level,
            )
        for step in steps
    ]

    canonical_prompt = serialize_prompt(steps)

    return ParseResponse(
        steps=serialized_steps,
        ladder=ladder,
        variables=variables,
        compiled=CompiledSchema(**compiled),
        prompt=canonical_prompt,
    )
