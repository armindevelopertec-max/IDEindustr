from typing import Dict, List

from fastapi import APIRouter
from pydantic import BaseModel

from app.services import (
    ladder_generator,
    grafcet_engine,
    parser as cnl_parser,
    variable_mapper,
)


class TransitionSchema(BaseModel):
    source: str
    target: str
    condition: str


class StepSchema(BaseModel):
    name: str
    actions: List[str]
    transitions: List[TransitionSchema]
    level: int


class ParseRequest(BaseModel):
    text: str


class ParseResponse(BaseModel):
    steps: List[StepSchema]
    ladder: List[str]
    variables: Dict[str, str]


router = APIRouter()


@router.post("/parse", response_model=ParseResponse)
def parse_text(payload: ParseRequest) -> ParseResponse:
    pairs = cnl_parser.parse_cnl(payload.text)
    steps = grafcet_engine.build_grafcet(pairs)
    ladder = ladder_generator.generate_ladder(steps)
    variables = variable_mapper.default_variable_map()

    serialized_steps = [
            StepSchema(
                name=step.name,
                actions=step.actions,
                transitions=[
                    TransitionSchema(
                        source=t.source,
                        target=t.target,
                        condition=t.condition,
                    )
                    for t in step.transitions
                ],
                level=step.level,
            )
        for step in steps
    ]

    return ParseResponse(steps=serialized_steps, ladder=ladder, variables=variables)
